// Lembretes de compromissos: padrões por prioridade e opções do formulário. Puro (usado no cliente e no servidor).

export interface DefaultReminder {
  minutesBefore: number;
  method: "popup" | "email";
}

/** Lembretes padrão por prioridade (escalonamento da etapa 8C). */
export const DEFAULT_REMINDERS: Record<number, DefaultReminder[]> = {
  1: [
    { minutesBefore: 1440, method: "popup" },
    { minutesBefore: 60, method: "popup" },
    { minutesBefore: 10, method: "popup" },
  ],
  2: [
    { minutesBefore: 60, method: "popup" },
    { minutesBefore: 10, method: "popup" },
  ],
  3: [{ minutesBefore: 10, method: "popup" }],
};

/** Google aceita até 5 lembretes por evento. */
export const MAX_REMINDERS = 5;

/** Até 4 semanas (limite do Google). */
export const MAX_REMINDER_MINUTES = 40320;

export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 1440];

export function defaultReminderMinutes(priority: number): number[] {
  return (DEFAULT_REMINDERS[priority] ?? []).map((r) => r.minutesBefore);
}

/** "Na hora", "10 min", "1 h", "1 h 30", "1 dia", "2 dias", "1 semana". */
export function formatReminder(min: number): string {
  if (min === 0) return "Na hora";
  if (min % 10080 === 0) return min === 10080 ? "1 semana" : `${min / 10080} semanas`;
  if (min % 1440 === 0) return min === 1440 ? "1 dia" : `${min / 1440} dias`;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m}` : `${h} h`;
  }
  return `${min} min`;
}

/** Liga/desliga um lembrete; devolve a lista sem repetição, em ordem decrescente, respeitando o limite. */
export function toggleReminder(list: number[], min: number): number[] {
  if (list.includes(min)) return list.filter((m) => m !== min);
  if (list.length >= MAX_REMINDERS) return list;
  return [...list, min].sort((a, b) => b - a);
}
