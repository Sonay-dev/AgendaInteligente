// Visões da agenda: intervalo carregado, navegação e rótulos. Puro (sem React).
import { addDaysYmd, fromZoned, zoned } from "@/lib/time";
import type { CalendarEvent } from "./api";

export const VIEWS = [
  { id: "dia", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "lista", label: "Lista" },
] as const;
export type View = (typeof VIEWS)[number]["id"];
export const isView = (v: unknown): v is View => VIEWS.some((x) => x.id === v);

export const VIEW_COOKIE = "agenda_view";
export const LIST_DAYS = 30;

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function dowOf(ymd: string, tz: string): number {
  return zoned(fromZoned(ymd, "12:00", tz), tz).dow;
}

export function mondayOf(ymd: string, tz: string): string {
  return addDaysYmd(ymd, -((dowOf(ymd, tz) + 6) % 7));
}

export function todayYmd(tz: string): string {
  return zoned(new Date(), tz).ymd;
}

/** Dias (YYYY-MM-DD) exibidos pela visão. */
export function viewDays(view: View, anchor: string, tz: string): string[] {
  if (view === "dia") return [anchor];
  if (view === "semana") return Array.from({ length: 7 }, (_, i) => addDaysYmd(mondayOf(anchor, tz), i));
  if (view === "lista") return Array.from({ length: LIST_DAYS }, (_, i) => addDaysYmd(anchor, i));
  const first = `${anchor.slice(0, 7)}-01`;
  const start = mondayOf(first, tz);
  return Array.from({ length: 42 }, (_, i) => addDaysYmd(start, i));
}

/** Intervalo [from, to) em ISO para buscar na API. */
export function viewRange(view: View, anchor: string, tz: string): { from: string; to: string } {
  const days = viewDays(view, anchor, tz);
  return {
    from: fromZoned(days[0]!, "00:00", tz).toISOString(),
    to: fromZoned(addDaysYmd(days[days.length - 1]!, 1), "00:00", tz).toISOString(),
  };
}

export function stepAnchor(view: View, anchor: string, dir: -1 | 1): string {
  if (view === "dia") return addDaysYmd(anchor, dir);
  if (view === "semana") return addDaysYmd(anchor, 7 * dir);
  if (view === "lista") return addDaysYmd(anchor, LIST_DAYS * dir);
  const [y, m] = anchor.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function short(ymd: string) {
  const [, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function viewTitle(view: View, anchor: string, tz: string): string {
  const [y, m, d] = anchor.split("-").map(Number) as [number, number, number];
  if (view === "mes") return `${MONTHS[m - 1]} ${y}`;
  if (view === "dia") {
    const today = todayYmd(tz);
    const prefix = anchor === today ? "Hoje, " : anchor === addDaysYmd(today, 1) ? "Amanhã, " : `${WEEKDAYS_LONG[dowOf(anchor, tz)]}, `;
    return `${prefix}${d} de ${MONTHS[m - 1]}`;
  }
  const days = viewDays(view, anchor, tz);
  return `${short(days[0]!)} – ${short(days[days.length - 1]!)}`;
}

export function dayHeading(ymd: string, tz: string): string {
  const today = todayYmd(tz);
  const [, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const base = `${WEEKDAYS_LONG[dowOf(ymd, tz)]}, ${d} de ${MONTHS[m - 1]}`;
  if (ymd === today) return `Hoje · ${base}`;
  if (ymd === addDaysYmd(today, 1)) return `Amanhã · ${base}`;
  return base[0]!.toUpperCase() + base.slice(1);
}

/** Ocorrências que tocam o dia (dia inteiro: fim exclusivo). */
export function eventsOnDay(events: CalendarEvent[], ymd: string, tz: string): CalendarEvent[] {
  return events.filter((e) => {
    const s = zoned(new Date(e.occurrenceStart), tz).ymd;
    if (!e.allDay) return s === ymd;
    const end = zoned(new Date(e.occurrenceEnd), tz).ymd;
    return s <= ymd && end > ymd;
  });
}

// ---------------------------------------------------------------- filtros
export interface Filters {
  categories: string[]; // ids; "none" = sem categoria; vazio = todas
  priorities: number[]; // vazio = todas
  showDone: boolean;
  query: string;
}

export const EMPTY_FILTERS: Filters = { categories: [], priorities: [], showDone: true, query: "" };

export function applyFilters(events: CalendarEvent[], f: Filters): CalendarEvent[] {
  const q = f.query.trim().toLocaleLowerCase("pt-BR");
  return events.filter(
    (e) =>
      e.status !== "cancelado" &&
      (f.showDone || e.status !== "concluido") &&
      (!f.categories.length || f.categories.includes(e.categoryId ?? "none")) &&
      (!f.priorities.length || f.priorities.includes(e.priority)) &&
      (!q || `${e.title} ${e.location ?? ""} ${e.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(q)),
  );
}

export const activeFilterCount = (f: Filters) => f.categories.length + f.priorities.length + (f.showDone ? 0 : 1) + (f.query.trim() ? 1 : 0);

export const PRIORITY_LABEL: Record<number, string> = { 1: "P1 urgente", 2: "P2 importante", 3: "P3 normal" };
export const PRIORITY_DOT: Record<number, string> = { 1: "bg-red-500", 2: "bg-amber-500", 3: "bg-sky-500" };
export const NEUTRAL_COLOR = "#64748b";
