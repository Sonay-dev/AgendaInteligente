import "server-only";
// Regras de negócio dos compromissos. Grava no D1 primeiro (sync_status = pending)
// e dispara o envio ao Google em segundo plano — se falhar, o cron reenvia.
import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db";
import { auditLog, events, reminders, type EventRow } from "@/db/schema";
import { runInBackground } from "./background";
import { assertCategoryOwned } from "./categories-service";
import { findConflicts, type Conflict } from "./conflicts";
import type { Env } from "./env";
import { pushEvent } from "./google/calendar-sync";
import { expandOccurrences } from "./recurrence";
import { HttpError, type CurrentUser } from "./session";
import { normalizeAllDay, nowIso } from "./time";
import { DEFAULT_REMINDERS, type EventCreateInput, type EventPatchInput, type ReminderInput } from "./validation";

export interface Ctx {
  db: Db;
  env: Env;
  user: CurrentUser;
}

export type EventWithReminders = EventRow & { reminders: ReminderInput[] };

async function batch(db: Db, stmts: BatchItem<"sqlite">[]) {
  const [first, ...rest] = stmts;
  if (first) await db.batch([first, ...rest]);
}

function syncInBackground(ctx: Ctx, id: string) {
  void runInBackground(() => pushEvent({ db: ctx.db, env: ctx.env, userId: ctx.user.id }, id, "app"));
}

async function getOwned(ctx: Ctx, id: string): Promise<EventRow> {
  const [ev] = await ctx.db.select().from(events).where(and(eq(events.id, id), eq(events.userId, ctx.user.id), isNull(events.deletedAt)));
  if (!ev) throw new HttpError(404, "compromisso não encontrado");
  return ev;
}

async function remindersOf(db: Db, eventId: string): Promise<ReminderInput[]> {
  const rows = await db.select().from(reminders).where(eq(reminders.eventId, eventId));
  return rows.map((r) => ({ minutesBefore: r.minutesBefore, method: r.method === "email" ? "email" : "popup" }));
}

/** Compromissos que podem colidir com [startAt, endAt) — inclui séries recorrentes. */
export async function checkConflicts(
  ctx: Ctx,
  c: { id?: string; startAt: string; endAt: string; allDay: boolean; rrule?: string | null; timezone?: string | null },
): Promise<Conflict[]> {
  if (c.allDay) return [];
  const horizon = c.rrule ? new Date(Date.now() + 61 * 86400000).toISOString() : c.endAt;
  const candidates = await ctx.db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, ctx.user.id),
        isNull(events.deletedAt),
        eq(events.allDay, false),
        or(isNotNull(events.rrule), and(lt(events.startAt, horizon), gt(events.endAt, c.startAt))),
      ),
    );
  return findConflicts({ id: c.id ?? "", startAt: c.startAt, endAt: c.endAt, allDay: c.allDay, rrule: c.rrule, timezone: c.timezone }, candidates);
}

function normalizeTimes(input: { startAt: string; endAt: string; allDay: boolean; timezone: string }) {
  if (!input.allDay) return { startAt: new Date(input.startAt).toISOString(), endAt: new Date(input.endAt).toISOString() };
  return normalizeAllDay(input.startAt, input.endAt, input.timezone);
}

export async function listEvents(ctx: Ctx, from: string, to: string) {
  const rows = await ctx.db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, ctx.user.id),
        isNull(events.deletedAt),
        or(isNotNull(events.rrule), and(lt(events.startAt, to), gt(events.endAt, from))),
      ),
    );
  return expandOccurrences(rows, new Date(from), new Date(to));
}

export async function getEvent(ctx: Ctx, id: string): Promise<EventWithReminders> {
  const ev = await getOwned(ctx, id);
  return { ...ev, reminders: await remindersOf(ctx.db, id) };
}

export async function createEvent(ctx: Ctx, input: EventCreateInput): Promise<{ event: EventWithReminders; conflicts: Conflict[] }> {
  await assertCategoryOwned(ctx, input.categoryId);
  const times = normalizeTimes(input);
  const rrule = input.rrule || null;
  const conflicts = await checkConflicts(ctx, { ...times, allDay: input.allDay, rrule, timezone: input.timezone });
  if (conflicts.length && !input.allowConflicts) throw new HttpError(409, "conflito de horário", { conflicts });

  const id = crypto.randomUUID();
  const now = nowIso();
  const rems = input.reminders ?? DEFAULT_REMINDERS[input.priority] ?? [];
  await batch(ctx.db, [
    ctx.db.insert(events).values({
      id,
      userId: ctx.user.id,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      ...times,
      allDay: input.allDay,
      timezone: input.timezone,
      categoryId: input.categoryId ?? null,
      contactId: input.contactId ?? null,
      priority: input.priority,
      status: input.status,
      rrule,
      notes: input.notes ?? null,
      nextSteps: input.nextSteps ?? null,
      isFocus: input.isFocus,
      syncStatus: "pending",
      createdAt: now,
      updatedAt: now,
    }),
    ...rems.map((r) => ctx.db.insert(reminders).values({ userId: ctx.user.id, eventId: id, minutesBefore: r.minutesBefore, method: r.method })),
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "events", entityId: id, action: "create", source: "app", detail: conflicts.length ? { conflictsIgnored: conflicts.map((c) => c.id) } : null }),
  ]);
  syncInBackground(ctx, id);
  return { event: await getEvent(ctx, id), conflicts };
}

export async function updateEvent(ctx: Ctx, id: string, patch: EventPatchInput): Promise<{ event: EventWithReminders; conflicts: Conflict[] }> {
  const current = await getOwned(ctx, id);
  await assertCategoryOwned(ctx, patch.categoryId);
  const merged = {
    startAt: patch.startAt ?? current.startAt,
    endAt: patch.endAt ?? current.endAt,
    allDay: patch.allDay ?? current.allDay,
    timezone: patch.timezone ?? current.timezone,
  };
  if (new Date(merged.endAt) <= new Date(merged.startAt)) throw new HttpError(400, "fim deve ser depois do início");
  const times = normalizeTimes(merged);
  const rrule = patch.rrule === undefined ? current.rrule : patch.rrule || null;

  const timeChanged = times.startAt !== current.startAt || times.endAt !== current.endAt || merged.allDay !== current.allDay || rrule !== current.rrule;
  const conflicts = timeChanged ? await checkConflicts(ctx, { id, ...times, allDay: merged.allDay, rrule, timezone: merged.timezone }) : [];
  if (conflicts.length && !patch.allowConflicts) throw new HttpError(409, "conflito de horário", { conflicts });

  const { reminders: newReminders, allowConflicts: _a, ...fields } = patch;
  void _a;
  const stmts: BatchItem<"sqlite">[] = [
    ctx.db
      .update(events)
      .set({ ...fields, ...times, rrule, syncStatus: "pending", syncAttempts: 0, syncError: null, nextRetryAt: null, updatedAt: nowIso() })
      .where(eq(events.id, id)),
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "events", entityId: id, action: "update", source: "app", detail: { fields: Object.keys(patch) } }),
  ];
  if (newReminders) {
    stmts.push(ctx.db.delete(reminders).where(eq(reminders.eventId, id)));
    for (const r of newReminders) stmts.push(ctx.db.insert(reminders).values({ userId: ctx.user.id, eventId: id, minutesBefore: r.minutesBefore, method: r.method }));
  }
  await batch(ctx.db, stmts);
  syncInBackground(ctx, id);
  return { event: await getEvent(ctx, id), conflicts };
}

/** Soft delete: some do app na hora; o cron/background apaga no Google. */
export async function deleteEvent(ctx: Ctx, id: string): Promise<void> {
  await getOwned(ctx, id);
  const now = nowIso();
  await batch(ctx.db, [
    ctx.db.update(events).set({ deletedAt: now, syncStatus: "pending", syncAttempts: 0, nextRetryAt: null, updatedAt: now }).where(eq(events.id, id)),
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "events", entityId: id, action: "delete", source: "app" }),
  ]);
  syncInBackground(ctx, id);
}

export async function duplicateEvent(ctx: Ctx, id: string, opts: { startAt?: string; allowConflicts: boolean }) {
  const src = await getEvent(ctx, id);
  const dur = new Date(src.endAt).getTime() - new Date(src.startAt).getTime();
  // padrão: mesma hora, uma semana depois
  const start = opts.startAt ? new Date(opts.startAt) : new Date(new Date(src.startAt).getTime() + 7 * 86400000);
  return createEvent(ctx, {
    title: src.title,
    description: src.description,
    location: src.location,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + dur).toISOString(),
    allDay: src.allDay,
    timezone: src.timezone,
    categoryId: src.categoryId,
    contactId: src.contactId,
    priority: src.priority,
    status: "confirmado",
    rrule: src.rrule,
    notes: src.notes,
    nextSteps: src.nextSteps,
    isFocus: src.isFocus,
    reminders: src.reminders,
    allowConflicts: opts.allowConflicts,
  });
}
