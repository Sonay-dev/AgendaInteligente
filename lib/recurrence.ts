import { rrulestr, type RRule } from "rrule";
import { fromZoned, zoned } from "./time";

export interface Timed {
  id: string;
  startAt: string;
  endAt: string;
  rrule?: string | null;
  /** Fuso em que a regra é interpretada (como no Google). Sem fuso: UTC. */
  timezone?: string | null;
}

export type Occurrence<T extends Timed> = T & { occurrenceStart: string; occurrenceEnd: string };

export function normalizeRrule(rule: string): string {
  return rule.trim().replace(/^RRULE:/i, "");
}

function parseRule(rule: string, dtstart: Date): RRule {
  return rrulestr(`RRULE:${normalizeRrule(rule)}`, { dtstart }) as RRule;
}

export function isValidRrule(rule: string): boolean {
  try {
    parseRule(rule, new Date());
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Instante → "hora de parede" no fuso, representada como se fosse UTC (o rrule trabalha assim). */
function toFloating(date: Date, tz: string): Date {
  const z = zoned(date, tz);
  return new Date(Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s));
}

function fromFloating(date: Date, tz: string): Date {
  const ymd = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return fromZoned(ymd, `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`, tz);
}

/** Inícios das ocorrências de uma série que podem tocar [from, to). */
function seriesStarts(rule: string, start: Date, dur: number, from: Date, to: Date, tz: string | null | undefined): Date[] {
  if (!tz) return parseRule(rule, start).between(new Date(from.getTime() - dur), to, true);
  // BYDAY/horário seguem o relógio local: 22h de segunda continua 22h de segunda, com ou sem horário de verão.
  const margin = 36 * 3600_000;
  return parseRule(rule, toFloating(start, tz))
    .between(new Date(from.getTime() - dur - margin), new Date(to.getTime() + margin), true)
    .map((d) => fromFloating(d, tz));
}

/**
 * Expande itens (recorrentes ou não) dentro de [from, to).
 * Séries com `timezone` são expandidas na hora local desse fuso (BYDAY, horário de verão).
 */
export function expandOccurrences<T extends Timed>(items: T[], from: Date, to: Date, maxPerItem = 400): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const item of items) {
    const start = new Date(item.startAt);
    const end = new Date(item.endAt);
    const dur = end.getTime() - start.getTime();
    if (!item.rrule) {
      if (start < to && end > from) out.push({ ...item, occurrenceStart: item.startAt, occurrenceEnd: item.endAt });
      continue;
    }
    let dates: Date[];
    try {
      dates = seriesStarts(item.rrule, start, dur, from, to, item.timezone).slice(0, maxPerItem);
    } catch {
      dates = start < to && end > from ? [start] : [];
    }
    for (const d of dates) {
      const occEnd = new Date(d.getTime() + dur);
      if (d < to && occEnd > from) out.push({ ...item, occurrenceStart: d.toISOString(), occurrenceEnd: occEnd.toISOString() });
    }
  }
  return out.sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart));
}
