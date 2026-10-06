import { describe, expect, it } from "vitest";
import { MAX_REMINDERS, defaultReminderMinutes, formatReminder, toggleReminder } from "../lib/reminders/defaults";

describe("lembretes do formulário", () => {
  it("formata minutos em texto curto", () => {
    expect(formatReminder(0)).toBe("Na hora");
    expect(formatReminder(10)).toBe("10 min");
    expect(formatReminder(60)).toBe("1 h");
    expect(formatReminder(90)).toBe("1 h 30");
    expect(formatReminder(1440)).toBe("1 dia");
    expect(formatReminder(2880)).toBe("2 dias");
    expect(formatReminder(10080)).toBe("1 semana");
  });

  it("liga e desliga mantendo ordem decrescente e sem repetição", () => {
    expect(toggleReminder([10], 30)).toEqual([30, 10]);
    expect(toggleReminder([30, 10], 30)).toEqual([10]);
    expect(toggleReminder([], 0)).toEqual([0]);
  });

  it("não passa do limite do Google", () => {
    const full = [1440, 60, 30, 15, 10];
    expect(full).toHaveLength(MAX_REMINDERS);
    expect(toggleReminder(full, 5)).toEqual(full);
    expect(toggleReminder(full, 10)).toEqual([1440, 60, 30, 15]);
  });

  it("padrão segue a prioridade", () => {
    expect(defaultReminderMinutes(1)).toEqual([1440, 60, 10]);
    expect(defaultReminderMinutes(3)).toEqual([10]);
    expect(defaultReminderMinutes(9)).toEqual([]);
  });
});
