// Lembretes escalonados (etapa 8C) — puro, sem I/O, coberto por testes.
//
// Compromissos: usam os lembretes do próprio evento (padrão por prioridade: P1 = 1 dia, 1 h e 10 min antes;
//   P2 = 1 h e 10 min; P3 = 10 min). Dia inteiro: aviso às 08:00 do dia (P1 também na véspera às 18:00).
// Tarefas com prazo (escalonamento):
//   P1 → véspera, no prazo e, se atrasar, todo dia às 08:00 por até 7 dias;
//   P2 → no prazo e uma cobrança no dia seguinte, se atrasar;
//   P3 → só no prazo.
//   "No prazo": com hora → 1 h antes (P1), 10 min antes e na hora; dia inteiro → 08:00 do dia.
import { addDaysYmd, fromZoned, zoned } from "../time";

export interface ReminderSlot {
  key: string; // único por usuário (dedupe em notification_log)
  fireAt: string; // ISO UTC
  itemType: "event" | "task";
  itemId: string;
  occurrenceStart: string | null;
  priority: number;
  title: string;
  body: string;
  url: string;
}

export const MORNING = "08:00";
export const EVE = "18:00";
export const SEND_LATE_MS = 30 * 60_000; // ainda envia se o cron atrasou até 30 min
export const SEND_EARLY_MS = 150_000; // cron a cada 5 min: antecipa até 2,5 min
export const P1_OVERDUE_DAYS = 7;

const hm = (iso: string, tz: string) => zoned(new Date(iso), tz).hm;

function inWords(min: number): string {
  if (min <= 0) return "Começa agora";
  if (min < 60) return `Em ${min} min`;
  if (min < 1440) return min % 60 ? `Em ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `Em ${min / 60}h`;
  const d = Math.round(min / 1440);
  return d === 1 ? "Amanhã" : `Em ${d} dias`;
}

// ------------------------------------------------------------------ compromissos
export interface EventOccurrenceInput {
  id: string;
  title: string;
  location: string | null;
  allDay: boolean;
  priority: number;
  status: string;
  occurrenceStart: string;
  occurrenceEnd: string;
  reminders: number[]; // minutos antes
}

export function eventSlots(ev: EventOccurrenceInput, tz: string): ReminderSlot[] {
  if (ev.status === "concluido" || ev.status === "cancelado") return [];
  const day = zoned(new Date(ev.occurrenceStart), tz).ymd;
  const base = {
    itemType: "event" as const,
    itemId: ev.id,
    occurrenceStart: ev.occurrenceStart,
    priority: ev.priority,
    title: ev.title,
    url: `/agenda?v=dia&d=${day}`,
  };
  const where = ev.location ? ` · ${ev.location}` : "";

  if (ev.allDay) {
    const slots: ReminderSlot[] = [
      { ...base, key: `ev:${ev.id}:${ev.occurrenceStart}:dia`, fireAt: fromZoned(day, MORNING, tz).toISOString(), body: `Hoje (dia inteiro)${where}` },
    ];
    if (ev.priority === 1) {
      slots.push({ ...base, key: `ev:${ev.id}:${ev.occurrenceStart}:vespera`, fireAt: fromZoned(addDaysYmd(day, -1), EVE, tz).toISOString(), body: `Amanhã (dia inteiro)${where}` });
    }
    return slots;
  }

  const start = new Date(ev.occurrenceStart).getTime();
  const range = `${hm(ev.occurrenceStart, tz)}–${hm(ev.occurrenceEnd, tz)}`;
  return [...new Set(ev.reminders)].map((min) => ({
    ...base,
    key: `ev:${ev.id}:${ev.occurrenceStart}:${min}`,
    fireAt: new Date(start - min * 60_000).toISOString(),
    body: `${inWords(min)} · ${range}${where}`,
  }));
}

// ------------------------------------------------------------------ tarefas
export interface TaskInput {
  id: string;
  title: string;
  dueAt: string | null;
  dueAllDay: boolean;
  priority: number;
  status: string;
}

export function taskSlots(t: TaskInput, tz: string): ReminderSlot[] {
  if (!t.dueAt || t.status === "concluida") return [];
  const day = zoned(new Date(t.dueAt), tz).ymd;
  const prefix = `task:${t.id}:${t.dueAt}`; // prazo novo → lembretes novos
  const base = { itemType: "task" as const, itemId: t.id, occurrenceStart: null, priority: t.priority, title: t.title, url: "/tarefas" };
  const at = (ymd: string, time: string) => fromZoned(ymd, time, tz).toISOString();
  const slots: ReminderSlot[] = [];
  const add = (suffix: string, fireAt: string, body: string) => slots.push({ ...base, key: `${prefix}:${suffix}`, fireAt, body });

  if (t.dueAllDay) {
    if (t.priority === 1) add("vespera", at(addDaysYmd(day, -1), EVE), "Vence amanhã");
    add("dia", at(day, MORNING), "Vence hoje");
  } else {
    const due = new Date(t.dueAt).getTime();
    const time = hm(t.dueAt, tz);
    if (t.priority === 1) add("1d", new Date(due - 1440 * 60_000).toISOString(), `Vence amanhã às ${time}`);
    if (t.priority <= 2) add("60", new Date(due - 60 * 60_000).toISOString(), `Vence em 1h (${time})`);
    add("10", new Date(due - 10 * 60_000).toISOString(), `Vence em 10 min (${time})`);
    if (t.priority <= 2) add("0", t.dueAt, `Venceu agora (${time})`);
  }

  // cobranças de atraso (o dia seguinte ao prazo em diante, às 08:00)
  const nags = t.priority === 1 ? P1_OVERDUE_DAYS : t.priority === 2 ? 1 : 0;
  for (let i = 1; i <= nags; i++) add(`atraso${i}`, at(addDaysYmd(day, i), MORNING), i === 1 ? "Atrasada desde ontem" : `Atrasada há ${i} dias`);
  return slots;
}

// ------------------------------------------------------------------ o que enviar agora
/**
 * Lembretes cujo horário chegou (com folga para o cron de 5 em 5 min).
 * Se vários do mesmo item venceram juntos (ex.: o cron ficou parado), envia só o mais recente;
 * os anteriores voltam em `superseded` para serem marcados como enviados sem notificar.
 */
export function dueNow(slots: ReminderSlot[], now: Date): { send: ReminderSlot[]; superseded: ReminderSlot[] } {
  const t = now.getTime();
  const due = slots.filter((s) => {
    const f = new Date(s.fireAt).getTime();
    return f > t - SEND_LATE_MS && f <= t + SEND_EARLY_MS;
  });
  const latest = new Map<string, ReminderSlot>();
  for (const s of due) {
    const k = `${s.itemType}:${s.itemId}:${s.occurrenceStart ?? ""}`;
    const cur = latest.get(k);
    if (!cur || s.fireAt > cur.fireAt) latest.set(k, s);
  }
  const send = [...latest.values()].sort((a, b) => a.priority - b.priority || a.fireAt.localeCompare(b.fireAt));
  const keep = new Set(send.map((s) => s.key));
  return { send, superseded: due.filter((s) => !keep.has(s.key)) };
}

/** Quanto adiar ("Adiar" na notificação). */
export const SNOOZE_MIN = 15;
