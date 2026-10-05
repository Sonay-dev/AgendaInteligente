import { describe, expect, it } from "vitest";
import {
  backoffMs,
  DONE_PREFIX,
  fromGoogleEvent,
  googleIdFor,
  isRetryableStatus,
  resolveConflict,
  toGoogleEvent,
  type LocalEventForGoogle,
} from "../lib/google/mapping";

const base: LocalEventForGoogle = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  title: "Dentista",
  description: null,
  location: "Centro",
  startAt: "2026-10-05T13:00:00.000Z",
  endAt: "2026-10-05T14:00:00.000Z",
  allDay: false,
  timezone: "America/Sao_Paulo",
  priority: 2,
  status: "confirmado",
  rrule: null,
  isFocus: false,
};

describe("toGoogleEvent", () => {
  it("mapeia evento com horário (lembretes não suportados pelo Google são descartados)", () => {
    const g = toGoogleEvent(base, [
      { minutesBefore: 30, method: "popup" },
      { minutesBefore: 10, method: "push" },
    ]);
    expect(g.start).toEqual({ dateTime: base.startAt, timeZone: "America/Sao_Paulo" });
    expect(g.summary).toBe("Dentista");
    expect(g.status).toBe("confirmed");
    expect(g.reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 30 }] });
    expect(g.extendedProperties?.private).toMatchObject({ appId: base.id, focus: "0", priority: "2" });
  });

  it("dia inteiro usa date no fuso local", () => {
    const g = toGoogleEvent(
      { ...base, allDay: true, startAt: "2026-10-05T03:00:00.000Z", endAt: "2026-10-06T03:00:00.000Z" },
      [],
    );
    expect(g.start).toEqual({ date: "2026-10-05" });
    expect(g.end).toEqual({ date: "2026-10-06" });
  });

  it("status, foco, prioridade e recorrência", () => {
    expect(toGoogleEvent({ ...base, status: "concluido" }, []).summary).toBe(`${DONE_PREFIX}Dentista`);
    expect(toGoogleEvent({ ...base, status: "cancelado" }, []).status).toBe("cancelled");
    expect(toGoogleEvent({ ...base, isFocus: true }, []).colorId).toBe("9");
    expect(toGoogleEvent({ ...base, priority: 1 }, []).colorId).toBe("11");
    expect(toGoogleEvent({ ...base, rrule: "FREQ=WEEKLY" }, []).recurrence).toEqual(["RRULE:FREQ=WEEKLY"]);
  });
});

describe("fromGoogleEvent", () => {
  it("ida e volta preserva os campos", () => {
    const g = toGoogleEvent({ ...base, status: "concluido", isFocus: true, rrule: "FREQ=DAILY" }, [
      { minutesBefore: 15, method: "email" },
    ]);
    const l = fromGoogleEvent({ id: "abc", etag: '"1"', updated: "2026-10-01T00:00:00Z", ...g }, "America/Sao_Paulo");
    expect(l).toMatchObject({
      title: "Dentista",
      status: "concluido",
      isFocus: true,
      priority: 2,
      rrule: "FREQ=DAILY",
      startAt: base.startAt,
      endAt: base.endAt,
      allDay: false,
      googleEventId: "abc",
      googleEtag: '"1"',
      reminders: [{ minutesBefore: 15, method: "email" }],
    });
  });

  it("dia inteiro sem data final assume 1 dia", () => {
    const l = fromGoogleEvent({ id: "x", start: { date: "2026-10-05" }, end: {} }, "America/Sao_Paulo");
    expect(l?.endAt).toBe("2026-10-06T03:00:00.000Z");
  });

  it("ignora exceções de série e eventos sem horário", () => {
    expect(
      fromGoogleEvent(
        { id: "x", recurringEventId: "y", start: { dateTime: base.startAt }, end: { dateTime: base.endAt } },
        "UTC",
      ),
    ).toBeNull();
    expect(fromGoogleEvent({ id: "x" }, "UTC")).toBeNull();
  });

  it("evento externo sem título nem propriedades usa padrões", () => {
    const l = fromGoogleEvent(
      {
        id: "x",
        status: "cancelled",
        start: { date: "2026-10-05" },
        end: { date: "2026-10-06" },
        reminders: { useDefault: true },
      },
      "America/Sao_Paulo",
    );
    expect(l).toMatchObject({
      title: "(sem título)",
      status: "cancelado",
      allDay: true,
      startAt: "2026-10-05T03:00:00.000Z",
      endAt: "2026-10-06T03:00:00.000Z",
      priority: null,
      isFocus: false,
      reminders: null,
    });
  });
});

describe("resolveConflict", () => {
  const local = { updatedAt: "2026-10-02T12:00:00Z", syncStatus: "pending", googleEtag: '"1"' };

  it("sem local → aplica remoto", () => {
    expect(resolveConflict(null, { etag: '"2"' })).toBe("apply_remote");
  });
  it("mesmo etag → skip", () => {
    expect(resolveConflict(local, { etag: '"1"' })).toBe("skip");
  });
  it("local sincronizado → aplica remoto", () => {
    expect(resolveConflict({ ...local, syncStatus: "synced" }, { etag: '"2"', updated: "2026-01-01T00:00:00Z" })).toBe(
      "apply_remote",
    );
  });
  it("local pendente mais novo → mantém local", () => {
    expect(resolveConflict(local, { etag: '"2"', updated: "2026-10-02T11:00:00Z" })).toBe("keep_local");
  });
  it("remoto mais novo → aplica remoto", () => {
    expect(resolveConflict(local, { etag: '"2"', updated: "2026-10-02T13:00:00Z" })).toBe("apply_remote");
  });
});

describe("retry", () => {
  it("backoff exponencial com teto de 6 h e jitter de ±20%", () => {
    const mid = () => 0.5; // jitter neutro (fator 1,0)
    expect(backoffMs(1, mid)).toBe(60_000);
    expect(backoffMs(2, mid)).toBe(120_000);
    expect(backoffMs(4, mid)).toBe(480_000);
    expect(backoffMs(50, mid)).toBe(6 * 3600_000);
    expect(backoffMs(1, () => 0)).toBe(48_000);
    expect(backoffMs(1, () => 1)).toBe(72_000);
  });

  it("status que valem nova tentativa", () => {
    expect([429, 408, 500, 503].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 403, 404, 409, 412].some(isRetryableStatus)).toBe(false);
  });

  it("googleIdFor gera id base32hex", () => {
    expect(googleIdFor("0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe("0f8fad5bd9cb469fa16570867728950e");
  });
});
