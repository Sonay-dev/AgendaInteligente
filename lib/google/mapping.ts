// Conversões App ⇄ Google Calendar e regras de conflito/retry. Puro: sem I/O.
import { normalizeRrule } from "../recurrence";
import { addDaysYmd, fromZoned, zoned } from "../time";

export interface GoogleDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleReminderOverride {
  method: "popup" | "email";
  minutes: number;
}

export interface GoogleEvent {
  id: string;
  etag?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  recurrence?: string[];
  recurringEventId?: string;
  reminders?: { useDefault?: boolean; overrides?: GoogleReminderOverride[] };
  extendedProperties?: { private?: Record<string, string> };
  colorId?: string;
}

export interface LocalEventForGoogle {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  priority: number;
  status: string;
  rrule?: string | null;
  isFocus: boolean;
}

export interface LocalReminder {
  minutesBefore: number;
  method: string;
}

/** Id determinístico no Google (base32hex: 0-9a-v). UUID sem hífens é hex ⊂ base32hex → insert idempotente. */
export function googleIdFor(localId: string): string {
  return localId.replace(/-/g, "").toLowerCase();
}

export const DONE_PREFIX = "✅ ";

export function toGoogleEvent(ev: LocalEventForGoogle, reminders: LocalReminder[]): Omit<GoogleEvent, "id" | "etag" | "updated"> {
  const start: GoogleDateTime = ev.allDay
    ? { date: zoned(new Date(ev.startAt), ev.timezone).ymd }
    : { dateTime: ev.startAt, timeZone: ev.timezone };
  const end: GoogleDateTime = ev.allDay
    ? { date: zoned(new Date(ev.endAt), ev.timezone).ymd }
    : { dateTime: ev.endAt, timeZone: ev.timezone };
  const overrides = reminders
    .filter((r): r is LocalReminder & { method: "popup" | "email" } => r.method === "popup" || r.method === "email")
    .slice(0, 5)
    .map((r) => ({ method: r.method, minutes: r.minutesBefore }));

  return {
    summary: ev.status === "concluido" ? `${DONE_PREFIX}${ev.title}` : ev.title,
    description: ev.description ?? "",
    location: ev.location ?? "",
    start,
    end,
    status: ev.status === "cancelado" ? "cancelled" : "confirmed",
    recurrence: ev.rrule ? [`RRULE:${normalizeRrule(ev.rrule)}`] : [],
    reminders: { useDefault: false, overrides },
    colorId: ev.isFocus ? "9" : ev.priority === 1 ? "11" : undefined,
    extendedProperties: { private: { appId: ev.id, focus: ev.isFocus ? "1" : "0", priority: String(ev.priority) } },
  };
}

export interface LocalFromGoogle {
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  status: "confirmado" | "concluido" | "cancelado";
  isFocus: boolean;
  priority: number | null;
  googleEventId: string;
  googleEtag: string | null;
  googleUpdatedAt: string | null;
  reminders: LocalReminder[] | null; // null = manter os locais
}

/** Converte um evento do Google para os campos locais (null se não suportado, ex.: exceção de série). */
export function fromGoogleEvent(ge: GoogleEvent, defaultTz: string): LocalFromGoogle | null {
  if (ge.recurringEventId) return null; // exceções de instância: a série (master) é a referência
  if (!ge.start || !ge.end) return null;
  const tz = ge.start.timeZone || defaultTz;
  const allDay = !!ge.start.date;
  let startAt: string, endAt: string;
  if (allDay && ge.start.date) {
    startAt = fromZoned(ge.start.date, "00:00", tz).toISOString();
    endAt = fromZoned(ge.end.date ?? addDaysYmd(ge.start.date, 1), "00:00", tz).toISOString();
  } else if (ge.start.dateTime && ge.end.dateTime) {
    startAt = new Date(ge.start.dateTime).toISOString();
    endAt = new Date(ge.end.dateTime).toISOString();
  } else {
    return null;
  }
  const rawTitle = ge.summary?.trim() || "(sem título)";
  const done = rawTitle.startsWith(DONE_PREFIX);
  const rule = ge.recurrence?.find((r) => r.toUpperCase().startsWith("RRULE:"));
  const priority = Number(ge.extendedProperties?.private?.priority);
  return {
    title: done ? rawTitle.slice(DONE_PREFIX.length) : rawTitle,
    description: ge.description ?? null,
    location: ge.location ?? null,
    startAt,
    endAt,
    allDay,
    timezone: tz,
    rrule: rule ? normalizeRrule(rule) : null,
    status: ge.status === "cancelled" ? "cancelado" : done ? "concluido" : "confirmado",
    isFocus: ge.extendedProperties?.private?.focus === "1",
    priority: priority >= 1 && priority <= 3 ? priority : null,
    googleEventId: ge.id,
    googleEtag: ge.etag ?? null,
    googleUpdatedAt: ge.updated ?? null,
    reminders:
      ge.reminders && ge.reminders.useDefault === false
        ? (ge.reminders.overrides ?? []).map((o) => ({ minutesBefore: o.minutes, method: o.method }))
        : null,
  };
}

export type ConflictDecision = "apply_remote" | "keep_local" | "skip";

/**
 * Regra "última alteração vence".
 * - remoto igual ao que já conhecemos (mesmo etag) → skip
 * - local sem alterações pendentes → apply_remote
 * - local pendente: compara updated_at local × updated do Google
 */
export function resolveConflict(
  local: { updatedAt: string; syncStatus: string; googleEtag: string | null } | null,
  remote: { etag?: string | null; updated?: string | null },
): ConflictDecision {
  if (!local) return "apply_remote";
  if (remote.etag && local.googleEtag === remote.etag) return "skip";
  if (local.syncStatus !== "pending") return "apply_remote";
  const localTs = new Date(local.updatedAt).getTime();
  const remoteTs = remote.updated ? new Date(remote.updated).getTime() : 0;
  return localTs >= remoteTs ? "keep_local" : "apply_remote";
}

export const MAX_SYNC_ATTEMPTS = 10;

/** Backoff exponencial para o reenvio via cron: 1, 2, 4, 8 … min, teto de 6 h, com jitter opcional. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 6 * 3600_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

/** Status HTTP do Google que valem nova tentativa. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}
