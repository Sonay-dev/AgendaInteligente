import { describe, expect, it } from "vitest";
import { findConflicts, type ExistingEvent } from "../lib/conflicts";

const ev = (id: string, startAt: string, endAt: string, extra: Partial<ExistingEvent> = {}): ExistingEvent => ({
  id,
  title: id,
  startAt,
  endAt,
  allDay: false,
  ...extra,
});

const now = new Date("2026-10-01T00:00:00Z");

describe("findConflicts", () => {
  const existing = [
    ev("reuniao", "2026-10-05T13:00:00Z", "2026-10-05T14:00:00Z"),
    ev("foco", "2026-10-05T15:00:00Z", "2026-10-05T17:00:00Z", { isFocus: true }),
    ev("feriado", "2026-10-05T03:00:00Z", "2026-10-06T03:00:00Z", { allDay: true }),
    ev("cancelado", "2026-10-05T13:00:00Z", "2026-10-05T14:00:00Z", { status: "cancelado" }),
    ev("apagado", "2026-10-05T13:00:00Z", "2026-10-05T14:00:00Z", { deletedAt: "2026-10-01T00:00:00Z" }),
  ];

  it("detecta sobreposição e ignora dia inteiro, cancelados e excluídos", () => {
    const r = findConflicts({ id: "novo", startAt: "2026-10-05T13:30:00Z", endAt: "2026-10-05T15:30:00Z" }, existing, now);
    expect(r.map((c) => c.id)).toEqual(["reuniao", "foco"]);
    expect(r[1]?.isFocus).toBe(true);
  });

  it("intervalos encostados não conflitam", () => {
    const r = findConflicts({ id: "novo", startAt: "2026-10-05T14:00:00Z", endAt: "2026-10-05T15:00:00Z" }, existing, now);
    expect(r).toEqual([]);
  });

  it("ignora o próprio item ao editar", () => {
    const r = findConflicts({ id: "reuniao", startAt: "2026-10-05T13:00:00Z", endAt: "2026-10-05T14:00:00Z" }, existing, now);
    expect(r).toEqual([]);
  });

  it("candidato de dia inteiro nunca conflita", () => {
    const r = findConflicts(
      { id: "novo", startAt: "2026-10-05T03:00:00Z", endAt: "2026-10-06T03:00:00Z", allDay: true },
      existing,
      now,
    );
    expect(r).toEqual([]);
  });

  it("candidato recorrente conflita com evento futuro numa das ocorrências", () => {
    const r = findConflicts(
      { id: "novo", startAt: "2026-10-01T13:00:00Z", endAt: "2026-10-01T13:45:00Z", rrule: "FREQ=DAILY" },
      existing,
      now,
    );
    expect(r.map((c) => c.id)).toEqual(["reuniao"]);
  });

  it("evento existente recorrente conflita com candidato simples", () => {
    const serie = [ev("semanal", "2026-09-07T12:00:00Z", "2026-09-07T12:30:00Z", { rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO" })];
    const r = findConflicts({ id: "novo", startAt: "2026-10-05T12:15:00Z", endAt: "2026-10-05T13:00:00Z" }, serie, now);
    expect(r).toHaveLength(1);
    expect(r[0]?.startAt).toBe("2026-10-05T12:00:00.000Z");
  });
});

describe("recorrência no fuso do evento", () => {
  it("22h de segunda em São Paulo continua na segunda (não vira terça em UTC)", async () => {
    const { expandOccurrences } = await import("../lib/recurrence");
    // segunda 5/out 22:00 -03 = terça 01:00 UTC
    const serie = { id: "s", startAt: "2026-10-06T01:00:00.000Z", endAt: "2026-10-06T02:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=MO", timezone: "America/Sao_Paulo" };
    const occ = expandOccurrences([serie], new Date("2026-10-01T00:00:00Z"), new Date("2026-10-25T00:00:00Z"));
    expect(occ.map((o) => o.occurrenceStart)).toEqual(["2026-10-06T01:00:00.000Z", "2026-10-13T01:00:00.000Z", "2026-10-20T01:00:00.000Z"]);
  });

  it("academia seg/qua/sex 6h não conflita com reunião de terça 6h", () => {
    const academia = { id: "a", title: "Academia", allDay: false, startAt: "2026-10-05T09:00:00.000Z", endAt: "2026-10-05T10:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", timezone: "America/Sao_Paulo" };
    const terca = { id: "t", startAt: "2026-10-06T09:00:00.000Z", endAt: "2026-10-06T10:00:00.000Z" };
    const quarta = { id: "q", startAt: "2026-10-07T09:30:00.000Z", endAt: "2026-10-07T10:30:00.000Z" };
    expect(findConflicts(terca, [academia], now)).toEqual([]);
    expect(findConflicts(quarta, [academia], now).map((c) => c.id)).toEqual(["a"]);
  });
});
