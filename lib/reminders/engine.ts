import "server-only";
// Motor dos lembretes (etapa 8C): chamado pelo cron a cada 5 min.
// Junta compromissos (com séries expandidas), tarefas com prazo e lembretes adiados; decide o que vence
// agora (schedule.ts), registra em notification_log ANTES de enviar (no máximo uma vez) e manda o Web Push.
import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import type { Db } from "@/db";
import { events, notificationLog, pushSubscriptions, reminders, scheduledNotifications, tasks, users } from "@/db/schema";
import type { Env } from "../env";
import { createActionToken } from "../push/action-token";
import { sendWebPush, type VapidConfig } from "../push/webpush";
import { expandOccurrences } from "../recurrence";
import { zoned } from "../time";
import { DEFAULT_REMINDERS } from "../validation";
import { SEND_EARLY_MS, SNOOZE_MIN, dueNow, eventSlots, taskSlots, type ReminderSlot } from "./schedule";

const MAX_PER_RUN = 8; // limite de subrequisições do Workers

export function vapidFrom(env: Env): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  const subject = env.VAPID_SUBJECT || (env.APP_URL.startsWith("https://") ? env.APP_URL : "mailto:agenda@localhost");
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject };
}

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
  priority: number;
  token?: string;
  actions?: { action: "concluir" | "adiar"; title: string }[];
}

/** Envia para todos os aparelhos do usuário; remove assinaturas que o serviço de push deu como encerradas. */
export async function pushToUser(db: Db, env: Env, userId: string, msg: PushMessage) {
  const vapid = vapidFrom(env);
  if (!vapid) return { sent: 0, gone: 0, errors: 0, devices: 0 };
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0, gone = 0, errors = 0;
  for (const s of subs) {
    try {
      const r = await sendWebPush(s, msg, vapid, {
        urgency: msg.priority === 1 ? "high" : "normal",
        ttlSeconds: msg.priority === 1 ? 6 * 3600 : 3600,
        topic: msg.tag,
      });
      if (r.outcome === "ok") sent++;
      else if (r.outcome === "gone") {
        gone++;
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      } else errors++;
    } catch {
      errors++;
    }
  }
  return { sent, gone, errors, devices: subs.length };
}

async function toMessage(env: Env, userId: string, slot: ReminderSlot, recurring: boolean): Promise<PushMessage> {
  const token = await createActionToken({ u: userId, t: slot.itemType, id: slot.itemId, occ: slot.occurrenceStart, rec: recurring }, env.AUTH_SECRET);
  return {
    title: `${slot.priority === 1 ? "🔴 " : slot.priority === 2 ? "🟠 " : ""}${slot.title}`,
    body: slot.body,
    tag: `${slot.itemType}-${slot.itemId}`.slice(0, 64),
    url: slot.url,
    priority: slot.priority,
    token,
    // série recorrente: "Concluir" marcaria a série inteira → só "Adiar"
    actions: [...(recurring ? [] : [{ action: "concluir" as const, title: "Concluir" }]), { action: "adiar", title: `Adiar ${SNOOZE_MIN} min` }],
  };
}

export async function runReminders(db: Db, env: Env, userId: string, now = new Date()) {
  const [subs] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1);
  if (!subs || !vapidFrom(env)) return { skipped: "sem_aparelho" as const };
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  const tz = user?.timezone ?? "America/Sao_Paulo";

  const from = new Date(now.getTime() - 3600_000);
  const to = new Date(now.getTime() + 36 * 3600_000); // até a véspera (P1 1 dia antes / 18:00)
  const nowIso = now.toISOString();

  const [evRows, taskRows, snoozed] = await Promise.all([
    db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          isNull(events.deletedAt),
          ne(events.status, "cancelado"),
          or(isNotNull(events.rrule), and(lt(events.startAt, to.toISOString()), gt(events.endAt, from.toISOString()))),
        ),
      ),
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          ne(tasks.status, "concluida"),
          isNotNull(tasks.dueAt),
          gte(tasks.dueAt, new Date(now.getTime() - 9 * 86400_000).toISOString()),
          lt(tasks.dueAt, to.toISOString()),
        ),
      ),
    db
      .select()
      .from(scheduledNotifications)
      .where(and(eq(scheduledNotifications.userId, userId), isNull(scheduledNotifications.sentAt), lte(scheduledNotifications.fireAt, new Date(now.getTime() + SEND_EARLY_MS).toISOString()))),
  ]);

  // lembretes de cada compromisso (sem linhas → padrão pela prioridade)
  const occ = expandOccurrences(evRows, from, to);
  const ids = [...new Set(occ.map((o) => o.id))];
  const remRows = ids.length ? await db.select().from(reminders).where(inArray(reminders.eventId, ids)) : [];
  const remBy = new Map<string, number[]>();
  for (const r of remRows) if (r.eventId) remBy.set(r.eventId, [...(remBy.get(r.eventId) ?? []), r.minutesBefore]);

  const slots: ReminderSlot[] = [
    ...occ.flatMap((o) =>
      eventSlots({ ...o, reminders: remBy.get(o.id) ?? (DEFAULT_REMINDERS[o.priority] ?? []).map((r) => r.minutesBefore) }, tz),
    ),
    ...taskRows.flatMap((t) => taskSlots(t, tz)),
  ];
  const { send, superseded } = dueNow(slots, now);

  // adiados: montados com os dados atuais do item (se já foi concluído/apagado, não avisa)
  const snoozeSlots: ReminderSlot[] = [];
  for (const s of snoozed) {
    const ev = s.itemType === "event" ? evRows.find((e) => e.id === s.itemId) : undefined;
    const tk = s.itemType === "task" ? taskRows.find((t) => t.id === s.itemId) : undefined;
    const live = ev ? ev.status !== "concluido" : !!tk;
    if (live) {
      const start = s.occurrenceStart ?? ev?.startAt;
      snoozeSlots.push({
        key: `snz:${s.id}`,
        fireAt: s.fireAt,
        itemType: s.itemType,
        itemId: s.itemId,
        occurrenceStart: s.occurrenceStart,
        priority: (ev ?? tk)!.priority,
        title: (ev ?? tk)!.title,
        body: ev && start ? `Lembrete adiado · começa ${zoned(new Date(start), tz).hm}` : "Lembrete adiado",
        url: ev ? `/agenda?v=dia&d=${zoned(new Date(start!), tz).ymd}` : "/tarefas",
      });
    }
  }
  if (snoozed.length) {
    await db.update(scheduledNotifications).set({ sentAt: nowIso }).where(inArray(scheduledNotifications.id, snoozed.map((s) => s.id)));
  }

  const toSend = [...snoozeSlots, ...send].slice(0, MAX_PER_RUN);
  // registra antes de enviar: se outra execução do cron correr junto, só uma ganha o insert
  const logRows = [...toSend, ...superseded].map((s) => ({ userId, key: s.key, itemType: s.itemType, itemId: s.itemId, title: s.title }));
  const inserted = new Set<string>();
  for (let i = 0; i < logRows.length; i += 20) {
    const res = await db.insert(notificationLog).values(logRows.slice(i, i + 20)).onConflictDoNothing().returning({ key: notificationLog.key });
    for (const r of res) inserted.add(r.key);
  }

  const recurring = new Set(evRows.filter((e) => e.rrule).map((e) => e.id));
  const results: { key: string; sent: number }[] = [];
  for (const slot of toSend) {
    if (!inserted.has(slot.key)) continue; // já enviado antes
    const r = await pushToUser(db, env, userId, await toMessage(env, userId, slot, slot.itemType === "event" && recurring.has(slot.itemId)));
    results.push({ key: slot.key, sent: r.sent });
  }
  return { sent: results.length, results, superseded: superseded.length };
}

/** Usuários com ao menos um aparelho inscrito (para o cron). */
export async function usersWithDevices(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  return rows.map((r) => r.userId);
}
