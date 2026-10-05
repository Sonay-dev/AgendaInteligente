import { describe, expect, it } from "vitest";
import { addDaysYmd, diffDaysYmd, formatDateTime, fromZoned, isValidTimeZone, normalizeAllDay, zoned } from "../lib/time";

describe("time", () => {
  it("converte hora de parede de São Paulo (UTC-3) para UTC", () => {
    expect(fromZoned("2026-10-02", "10:00").toISOString()).toBe("2026-10-02T13:00:00.000Z");
  });

  it("respeita horário de verão em fusos que o têm", () => {
    expect(fromZoned("2026-01-15", "12:00", "America/New_York").toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(fromZoned("2026-07-15", "12:00", "America/New_York").toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("zoned devolve as partes no fuso pedido", () => {
    const z = zoned(new Date("2026-10-02T02:30:00Z"));
    expect(z.ymd).toBe("2026-10-01");
    expect(z.hm).toBe("23:30");
    expect(z.dow).toBe(4); // quinta
  });

  it("soma e subtrai dias atravessando meses e anos", () => {
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDaysYmd("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("normaliza dia inteiro para meia-noite local com fim exclusivo", () => {
    const r = normalizeAllDay("2026-10-02T15:00:00Z", "2026-10-03T02:59:00Z", "America/Sao_Paulo");
    expect(r).toEqual({ startAt: "2026-10-02T03:00:00.000Z", endAt: "2026-10-03T03:00:00.000Z" });
  });

  it("dia inteiro nunca fica com menos de 1 dia", () => {
    const r = normalizeAllDay("2026-10-02T03:00:00Z", "2026-10-02T03:00:00Z", "America/Sao_Paulo");
    expect(r.endAt).toBe("2026-10-03T03:00:00.000Z");
  });

  it("valida fusos e formata em pt-BR", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
    expect(formatDateTime("2026-10-02T13:00:00Z")).toBe("sex, 2 out · 10:00");
    expect(formatDateTime("2026-10-02T13:00:00Z", undefined, true)).toBe("sex, 2 out");
  });

  it("rejeita datas mal formadas", () => {
    expect(() => fromZoned("02/10/2026", "10:00")).toThrow();
  });
});
