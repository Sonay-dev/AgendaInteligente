// Detecção de conflito de horário (puro, sem I/O — coberto por testes).
import { expandOccurrences, type Timed } from "./recurrence";

export interface ConflictCandidate extends Timed {
  allDay?: boolean;
}

export interface ExistingEvent extends Timed {
  title: string;
  allDay: boolean;
  isFocus?: boolean;
  status?: string;
  deletedAt?: string | null;
}

export interface Conflict {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  isFocus: boolean;
}

/** Janela em que ocorrências de um candidato recorrente são verificadas. */
export const RECURRING_CHECK_DAYS = 60;

/**
 * Retorna os compromissos que se sobrepõem ao candidato.
 * - eventos de dia inteiro, cancelados, excluídos e o próprio item são ignorados;
 * - intervalos encostados (fim == início) NÃO conflitam;
 * - candidatos recorrentes são verificados nos próximos RECURRING_CHECK_DAYS dias.
 */
export function findConflicts(candidate: ConflictCandidate, existing: ExistingEvent[], now: Date = new Date()): Conflict[] {
  if (candidate.allDay) return [];
  const others = existing.filter(
    (e) => e.id !== candidate.id && !e.allDay && !e.deletedAt && e.status !== "cancelado",
  );
  if (!others.length) return [];

  const candStart = new Date(candidate.startAt);
  const windowStart = candidate.rrule ? new Date(Math.max(candStart.getTime(), now.getTime() - 86400000)) : candStart;
  const windowEnd = candidate.rrule
    ? new Date(windowStart.getTime() + RECURRING_CHECK_DAYS * 86400000)
    : new Date(candidate.endAt);
  const candOcc = expandOccurrences([candidate], windowStart, windowEnd, 120);

  const found = new Map<string, Conflict>();
  for (const c of candOcc) {
    const cs = new Date(c.occurrenceStart), ce = new Date(c.occurrenceEnd);
    for (const o of expandOccurrences(others, cs, ce)) {
      const os = new Date(o.occurrenceStart), oe = new Date(o.occurrenceEnd);
      if (os < ce && oe > cs && !found.has(o.id)) {
        found.set(o.id, { id: o.id, title: o.title, startAt: o.occurrenceStart, endAt: o.occurrenceEnd, isFocus: !!o.isFocus });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}
