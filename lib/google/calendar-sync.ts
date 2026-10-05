import "server-only";
// Sincronização bidirecional com o Google Calendar ("primary").
//  App → Google: pushEvent / pushPending (insert idempotente, patch com If-Match, delete).
//  Google → App: pullCalendar (incremental por syncToken; 410 → full sync paginado em várias execuções).
//  Canal de push: ensureWatch (events.watch) renovado pelo cron.
// Atenção ao plano free do Workers: ≤ 50 subrequisições/consultas por invocação → lotes e limites.
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db";
import { auditLog, events, reminders, syncState, users } from "@/db/schema";
import { randomToken } from "../crypto";
import type { Env } from "../env";
import { nowIso } from "../time";
import { GoogleApiError, GoogleAuthMissing, googleFetch, hasGoogleConnection } from "./client";
import {
  MAX_SYNC_ATTEMPTS,
  backoffMs,
  fromGoogleEvent,
  googleIdFor,
  resolveConflict,
  toGoogleEvent,
  type GoogleEvent,
  type LocalFromGoogle,
} from "./mapping";

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const WATCH_TTL_S = 7 * 24 * 3600; // máximo aceito pelo Google para Calendar
const RENEW_BEFORE_MS = 24 * 3600_000;
const MAX_PAGES_PER_RUN = 4;
const PAGE_PREFIX = "page:";

export interface SyncCtx {
  db: Db;
  env: Env;
  userId: string;
}

type AuditInput = { entity: string; entityId?: string | null; action: string; source: "app" | "google" | "cron" | "system"; detail?: Record<string, unknown> };

function auditStmt(ctx: SyncCtx, a: AuditInput) {
  return ctx.db.insert(auditLog).values({ userId: ctx.userId, entity: a.entity, entityId: a.entityId ?? null, action: a.action, source: a.source, detail: a.detail ?? null });
}

async function runBatch(db: Db, stmts: BatchItem<"sqlite">[]) {
  for (let i = 0; i < stmts.length; i += 40) {
    const chunk = stmts.slice(i, i + 40);
    const [first, ...rest] = chunk;
    if (first) await db.batch([first, ...rest]);
  }
}

/** Erro "seguro" para gravar (sem tokens ou payloads). */
function safeMessage(e: unknown): string {
  if (e instanceof GoogleApiError) return `google_${e.status}_${e.reason}`.slice(0, 200);
  if (e instanceof GoogleAuthMissing) return "google_nao_conectado";
  return (e instanceof Error ? e.name : "erro").slice(0, 200);
}

// =====================================================================================
// App → Google
// =====================================================================================

export type PushResult = "synced" | "deleted" | "remote_won" | "retry" | "error" | "missing" | "not_connected";

export async function pushEvent(ctx: SyncCtx, eventId: string, source: "app" | "cron" = "app"): Promise<PushResult> {
  const { db } = ctx;
  const [ev] = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.userId, ctx.userId)));
  if (!ev) return "missing";
  // sem integração ativa o item só fica "pending"; vai junto quando o usuário conectar
  if (!(await hasGoogleConnection(ctx))) return "not_connected";

  try {
    // ---- exclusão
    if (ev.deletedAt) {
      if (ev.googleEventId) {
        await googleFetch<void>(ctx, `${CAL}/${encodeURIComponent(ev.googleEventId)}`, { method: "DELETE" }).catch((e: unknown) => {
          if (!(e instanceof GoogleApiError) || (e.status !== 404 && e.status !== 410)) throw e;
        });
      }
      await runBatch(db, [
        db.update(events).set({ syncStatus: "synced", syncAttempts: 0, syncError: null, nextRetryAt: null }).where(eq(events.id, ev.id)),
        auditStmt(ctx, { entity: "events", entityId: ev.id, action: "google_delete", source }),
      ]);
      return "deleted";
    }

    const rems = await db.select().from(reminders).where(eq(reminders.eventId, ev.id));
    const body = JSON.stringify(toGoogleEvent(ev, rems));
    let saved: GoogleEvent;

    if (ev.googleEventId) {
      const url = `${CAL}/${encodeURIComponent(ev.googleEventId)}`;
      try {
        saved = await googleFetch<GoogleEvent>(ctx, url, { method: "PATCH", body, headers: ev.googleEtag ? { "If-Match": ev.googleEtag } : {} });
      } catch (e) {
        if (e instanceof GoogleApiError && e.status === 412) {
          // alguém alterou no Google desde o último sync → "última alteração vence"
          const remote = await googleFetch<GoogleEvent>(ctx, url);
          const decision = resolveConflict({ updatedAt: ev.updatedAt, syncStatus: "pending", googleEtag: ev.googleEtag }, remote);
          if (decision === "apply_remote") {
            const mapped = fromGoogleEvent(remote, ev.timezone);
            if (mapped) await applyRemote(ctx, ev.id, mapped, { conflict: "remote_won", localUpdatedAt: ev.updatedAt });
            return "remote_won";
          }
          await db.insert(auditLog).values({ userId: ctx.userId, entity: "events", entityId: ev.id, action: "conflict", source, detail: { winner: "local", localUpdatedAt: ev.updatedAt, remoteUpdated: remote.updated } });
          saved = await googleFetch<GoogleEvent>(ctx, url, { method: "PATCH", body });
        } else if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) {
          saved = await googleFetch<GoogleEvent>(ctx, CAL, { method: "POST", body }); // apagado definitivamente lá: recria
        } else {
          throw e;
        }
      }
    } else {
      try {
        // id determinístico → se uma tentativa anterior chegou ao Google, não duplica
        saved = await googleFetch<GoogleEvent>(ctx, CAL, { method: "POST", body: JSON.stringify({ ...JSON.parse(body), id: googleIdFor(ev.id) }) });
      } catch (e) {
        if (!(e instanceof GoogleApiError) || e.status !== 409) throw e;
        saved = await googleFetch<GoogleEvent>(ctx, `${CAL}/${googleIdFor(ev.id)}`, { method: "PATCH", body });
      }
    }

    const ids = { googleEventId: saved.id, googleEtag: saved.etag ?? null, googleUpdatedAt: saved.updated ?? null };
    // só marca "synced" se ninguém editou o item enquanto enviávamos
    const done = await db
      .update(events)
      .set({ ...ids, syncStatus: "synced", syncAttempts: 0, syncError: null, nextRetryAt: null })
      .where(and(eq(events.id, ev.id), eq(events.updatedAt, ev.updatedAt)))
      .returning({ id: events.id });
    if (!done.length) await db.update(events).set(ids).where(eq(events.id, ev.id));
    return "synced";
  } catch (e) {
    const attempts = ev.syncAttempts + 1;
    const msg = safeMessage(e);
    const authMissing = e instanceof GoogleAuthMissing || (e instanceof GoogleApiError && e.reason === "invalid_grant");
    await runBatch(db, [
      db
        .update(events)
        .set({
          syncStatus: attempts >= MAX_SYNC_ATTEMPTS ? "error" : "pending",
          syncAttempts: attempts,
          syncError: msg,
          nextRetryAt: new Date(Date.now() + (authMissing ? 3600_000 : backoffMs(attempts))).toISOString(),
        })
        .where(eq(events.id, ev.id)),
      auditStmt(ctx, { entity: "events", entityId: ev.id, action: "sync_error", source, detail: { error: msg, attempts } }),
    ]);
    return attempts >= MAX_SYNC_ATTEMPTS ? "error" : "retry";
  }
}

/** Reenvia pendentes cujo backoff venceu (chamado pelo cron). */
export async function pushPending(ctx: SyncCtx, limit = 6): Promise<Record<PushResult, number>> {
  const now = nowIso();
  const rows = await ctx.db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.userId, ctx.userId), eq(events.syncStatus, "pending"), or(isNull(events.nextRetryAt), lte(events.nextRetryAt, now))))
    .orderBy(events.updatedAt)
    .limit(limit);
  const out: Record<PushResult, number> = { synced: 0, deleted: 0, remote_won: 0, retry: 0, error: 0, missing: 0, not_connected: 0 };
  for (const r of rows) out[await pushEvent(ctx, r.id, "cron")]++;
  return out;
}

// =====================================================================================
// Google → App
// =====================================================================================

async function applyRemote(ctx: SyncCtx, localId: string | null, m: LocalFromGoogle, conflict?: Record<string, unknown>) {
  const { db } = ctx;
  const id = localId ?? crypto.randomUUID();
  const fields = {
    title: m.title,
    description: m.description,
    location: m.location,
    startAt: m.startAt,
    endAt: m.endAt,
    allDay: m.allDay,
    timezone: m.timezone,
    rrule: m.rrule,
    status: m.status,
    isFocus: m.isFocus,
    ...(m.priority ? { priority: m.priority } : {}),
    googleEventId: m.googleEventId,
    googleEtag: m.googleEtag,
    googleUpdatedAt: m.googleUpdatedAt,
    syncStatus: "synced" as const,
    syncAttempts: 0,
    syncError: null,
    nextRetryAt: null,
    deletedAt: null,
    updatedAt: m.googleUpdatedAt ?? nowIso(), // base da regra "última alteração vence"
  };
  const stmts: BatchItem<"sqlite">[] = [
    localId
      ? db.update(events).set(fields).where(eq(events.id, localId))
      : db.insert(events).values({ id, userId: ctx.userId, ...fields }),
  ];
  if (m.reminders) {
    stmts.push(db.delete(reminders).where(eq(reminders.eventId, id)));
    for (const r of m.reminders) {
      stmts.push(db.insert(reminders).values({ userId: ctx.userId, eventId: id, minutesBefore: r.minutesBefore, method: r.method === "email" ? "email" : "popup" }));
    }
  }
  stmts.push(auditStmt(ctx, { entity: "events", entityId: id, action: conflict ? "conflict" : localId ? "google_update" : "google_create", source: "google", detail: conflict }));
  await runBatch(db, stmts);
}

export interface PullResult {
  applied: number;
  deleted: number;
  skipped: number;
  conflicts: number;
  full: boolean;
  more: boolean; // full sync continua na próxima execução
}

export async function pullCalendar(ctx: SyncCtx): Promise<PullResult> {
  const { db } = ctx;
  const [state] = await db.select().from(syncState).where(and(eq(syncState.userId, ctx.userId), eq(syncState.resource, "calendar")));
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, ctx.userId));
  const tz = user?.timezone ?? "America/Sao_Paulo";

  const token = state?.syncToken ?? null;
  const resumingFull = !!token?.startsWith(PAGE_PREFIX);
  const full = !token || resumingFull;
  let pageToken: string | undefined = resumingFull ? token!.slice(PAGE_PREFIX.length) : undefined;
  const result: PullResult = { applied: 0, deleted: 0, skipped: 0, conflicts: 0, full, more: false };

  let nextSyncToken: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const params = new URLSearchParams({ maxResults: "250", singleEvents: "false", showDeleted: "true" });
    if (!full && token) params.set("syncToken", token);
    if (pageToken) params.set("pageToken", pageToken);

    let res: { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };
    try {
      res = await googleFetch(ctx, `${CAL}?${params}`);
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 410) {
        // syncToken expirado → recomeça com full sync
        await saveState(ctx, { syncToken: null });
        await db.insert(auditLog).values({ userId: ctx.userId, entity: "sync", action: "full_sync_410", source: "google" });
        return pullCalendar(ctx);
      }
      throw e;
    }

    await applyPage(ctx, res.items ?? [], tz, result);
    pageToken = res.nextPageToken;
    nextSyncToken = res.nextSyncToken;
    if (!pageToken) break;
  }

  if (pageToken) {
    result.more = true;
    await saveState(ctx, { syncToken: `${PAGE_PREFIX}${pageToken}` });
  } else if (nextSyncToken) {
    await saveState(ctx, { syncToken: nextSyncToken, lastSyncAt: nowIso(), ...(full ? { lastFullSyncAt: nowIso() } : {}) });
  }
  return result;
}

async function applyPage(ctx: SyncCtx, items: GoogleEvent[], tz: string, result: PullResult) {
  if (!items.length) return;
  const { db } = ctx;
  const googleIds = items.map((i) => i.id);
  const appIds = items.map((i) => i.extendedProperties?.private?.appId).filter((v): v is string => !!v);
  const locals = await db
    .select({ id: events.id, googleEventId: events.googleEventId, updatedAt: events.updatedAt, syncStatus: events.syncStatus, googleEtag: events.googleEtag, deletedAt: events.deletedAt, timezone: events.timezone })
    .from(events)
    .where(and(eq(events.userId, ctx.userId), appIds.length ? or(inArray(events.googleEventId, googleIds), inArray(events.id, appIds)) : inArray(events.googleEventId, googleIds)));
  const byGoogle = new Map(locals.filter((l) => l.googleEventId).map((l) => [l.googleEventId as string, l]));
  const byId = new Map(locals.map((l) => [l.id, l]));

  for (const item of items) {
    const appId = item.extendedProperties?.private?.appId;
    const local = byGoogle.get(item.id) ?? (appId ? byId.get(appId) : undefined) ?? null;
    const decision = resolveConflict(local, item);
    if (decision === "skip") {
      result.skipped++;
      continue;
    }
    if (decision === "keep_local") {
      result.conflicts++;
      await db.insert(auditLog).values({ userId: ctx.userId, entity: "events", entityId: local?.id ?? null, action: "conflict", source: "google", detail: { winner: "local", remoteUpdated: item.updated ?? null } });
      continue; // o item local continua pending e será enviado
    }
    if (item.status === "cancelled") {
      if (local && !local.deletedAt) {
        await runBatch(db, [
          db.update(events).set({ deletedAt: nowIso(), syncStatus: "synced", googleEtag: item.etag ?? null }).where(eq(events.id, local.id)),
          auditStmt(ctx, { entity: "events", entityId: local.id, action: "google_delete", source: "google" }),
        ]);
        result.deleted++;
      } else result.skipped++;
      continue;
    }
    const mapped = fromGoogleEvent(item, local?.timezone ?? tz);
    if (!mapped) {
      result.skipped++;
      continue;
    }
    const conflict = local?.syncStatus === "pending" ? { winner: "remote", localUpdatedAt: local.updatedAt, remoteUpdated: item.updated ?? null } : undefined;
    if (conflict) result.conflicts++;
    await applyRemote(ctx, local?.id ?? null, mapped, conflict);
    result.applied++;
  }
}

async function saveState(ctx: SyncCtx, patch: Partial<typeof syncState.$inferInsert>) {
  await ctx.db
    .insert(syncState)
    .values({ userId: ctx.userId, resource: "calendar", ...patch, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: [syncState.userId, syncState.resource], set: { ...patch, updatedAt: nowIso() } });
}

// =====================================================================================
// Canal de push (events.watch)
// =====================================================================================

export async function ensureWatch(ctx: SyncCtx, force = false): Promise<"ok" | "renewed" | "skipped_local"> {
  if (!ctx.env.APP_URL.startsWith("https://")) return "skipped_local"; // o Google exige HTTPS público
  const [state] = await ctx.db.select().from(syncState).where(and(eq(syncState.userId, ctx.userId), eq(syncState.resource, "calendar")));
  const exp = state?.channelExpiration ? new Date(state.channelExpiration).getTime() : 0;
  if (!force && state?.channelId && exp - Date.now() > RENEW_BEFORE_MS) return "ok";

  if (state?.channelId && state.resourceId) {
    await googleFetch<void>(ctx, "https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      body: JSON.stringify({ id: state.channelId, resourceId: state.resourceId }),
    }).catch(() => undefined); // canal já expirado: ignorar
  }
  const channelId = crypto.randomUUID();
  const channelToken = randomToken();
  const res = await googleFetch<{ id: string; resourceId: string; expiration?: string }>(ctx, `${CAL}/watch`, {
    method: "POST",
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address: new URL("/api/google/webhook", ctx.env.APP_URL).toString(),
      token: channelToken,
      params: { ttl: String(WATCH_TTL_S) },
    }),
  });
  await saveState(ctx, {
    channelId: res.id,
    resourceId: res.resourceId,
    channelToken,
    channelExpiration: new Date(res.expiration ? Number(res.expiration) : Date.now() + WATCH_TTL_S * 1000).toISOString(),
  });
  await ctx.db.insert(auditLog).values({ userId: ctx.userId, entity: "sync", action: "watch_renewed", source: "cron" });
  return "renewed";
}

/** Usuário dono de um canal, validando o token do webhook. */
export async function findChannel(db: Db, channelId: string) {
  const [row] = await db
    .select({ userId: syncState.userId, channelToken: syncState.channelToken, resourceId: syncState.resourceId })
    .from(syncState)
    .where(and(eq(syncState.channelId, channelId), eq(syncState.resource, "calendar")));
  return row ?? null;
}

/** Contagem de pendências (para a UI). */
export async function pendingCount(db: Db, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.userId, userId), inArray(events.syncStatus, ["pending", "error"])));
  return Number(r?.n ?? 0);
}
