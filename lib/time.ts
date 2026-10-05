// Datas com fuso explícito (Intl), sem dependências: funciona no Workers, Node e navegador.
// Regra do projeto: banco em UTC (ISO 8601); exibição em America/Sao_Paulo.

export const DEFAULT_TZ = "America/Sao_Paulo";

export interface ZonedParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  dow: number; // 0 = domingo
  ymd: string; // YYYY-MM-DD
  hm: string; // HH:MM
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const pad = (n: number) => String(n).padStart(2, "0");

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function zoned(date: Date, tz: string = DEFAULT_TZ): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  const h = Number(parts.hour) % 24, mi = Number(parts.minute), s = Number(parts.second);
  return { y, m, d, h, mi, s, dow: DOW[parts.weekday ?? "Sun"] ?? 0, ymd: `${y}-${pad(m)}-${pad(d)}`, hm: `${pad(h)}:${pad(mi)}` };
}

function offsetMinutes(date: Date, tz: string): number {
  const z = zoned(date, tz);
  const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function splitYmd(ymd: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`data inválida: ${ymd}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function splitHm(hm: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) throw new Error(`hora inválida: ${hm}`);
  return [Number(m[1]), Number(m[2])];
}

/** Converte data/hora "de parede" no fuso `tz` para um instante absoluto (trata horário de verão). */
export function fromZoned(ymd: string, hm: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = splitYmd(ymd);
  const [h, mi] = splitHm(hm);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = offsetMinutes(new Date(guess), tz);
  let result = guess - off1 * 60000;
  const off2 = offsetMinutes(new Date(result), tz);
  if (off2 !== off1) result = guess - off2 * 60000;
  return new Date(result);
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = splitYmd(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diffDaysYmd(a: string, b: string): number {
  const [y1, m1, d1] = splitYmd(a);
  const [y2, m2, d2] = splitYmd(b);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

/** Normaliza um intervalo de dia inteiro: meia-noite local no início e fim exclusivo (≥ 1 dia). */
export function normalizeAllDay(startIso: string, endIso: string, tz: string): { startAt: string; endAt: string } {
  const startYmd = zoned(new Date(startIso), tz).ymd;
  const endZ = zoned(new Date(endIso), tz);
  // fim "inclusivo" (ex.: 23:59) vira a meia-noite seguinte; nunca menos de 1 dia
  let endYmd = endZ.hm === "00:00" ? endZ.ymd : addDaysYmd(endZ.ymd, 1);
  if (endYmd <= startYmd) endYmd = addDaysYmd(startYmd, 1);
  return { startAt: fromZoned(startYmd, "00:00", tz).toISOString(), endAt: fromZoned(endYmd, "00:00", tz).toISOString() };
}

export function nowIso(): string {
  return new Date().toISOString();
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatDateTime(iso: string, tz: string = DEFAULT_TZ, allDay = false): string {
  const z = zoned(new Date(iso), tz);
  const base = `${WEEKDAYS[z.dow]}, ${z.d} ${MONTHS[z.m - 1]}`;
  return allDay ? base : `${base} · ${z.hm}`;
}
