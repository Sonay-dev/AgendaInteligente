// Regras puras para notas estilo Kanban (estatísticas, cores, status e ordenação)
import type { NoteStatus } from "./validation";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NoteLike {
  id: string;
  title: string;
  content?: string | null;
  status: NoteStatus;
  priority: number;
  tag?: string | null;
  categoryId?: string | null;
  isArchived: boolean;
  isPinned: boolean;
  checklist?: ChecklistItem[] | string | null;
  reminderAt?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const NOTE_STATUS_META: Record<
  NoteStatus,
  {
    id: NoteStatus;
    label: string;
    singular: string;
    accentColor: string;
    badgeClass: string;
    cardBorderClass: string;
    cardBgClass: string;
    columnBorderClass: string;
    columnBadgeClass: string;
    glowClass: string;
  }
> = {
  pendente: {
    id: "pendente",
    label: "Pendentes",
    singular: "Pendente",
    accentColor: "#ef4444",
    badgeClass: "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20",
    cardBorderClass: "border-l-[5px] border-l-red-500 hover:border-red-500/60",
    cardBgClass: "bg-red-50/30 dark:bg-red-950/20 border-red-200/80 dark:border-red-900/50",
    columnBorderClass: "border-t-[4px] border-t-red-500",
    columnBadgeClass: "bg-red-500 text-white dark:bg-red-600",
    glowClass: "focus-visible:ring-red-500/30",
  },
  em_curso: {
    id: "em_curso",
    label: "Em Curso",
    singular: "Em Curso",
    accentColor: "#f59e0b",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    cardBorderClass: "border-l-[5px] border-l-amber-500 hover:border-amber-500/60",
    cardBgClass: "bg-amber-50/30 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/50",
    columnBorderClass: "border-t-[4px] border-t-amber-500",
    columnBadgeClass: "bg-amber-500 text-white dark:bg-amber-600",
    glowClass: "focus-visible:ring-amber-500/30",
  },
  realizado: {
    id: "realizado",
    label: "Realizados",
    singular: "Realizado",
    accentColor: "#10b981",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    cardBorderClass: "border-l-[5px] border-l-emerald-500 hover:border-emerald-500/60",
    cardBgClass: "bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/50",
    columnBorderClass: "border-t-[4px] border-t-emerald-500",
    columnBadgeClass: "bg-emerald-500 text-white dark:bg-emerald-600",
    glowClass: "focus-visible:ring-emerald-500/30",
  },
};

export interface PriorityMeta {
  label: string;
  short: string;
  badgeClass: string;
  dotColor: string;
}

export const PRIORITY_CONFIG: Record<1 | 2 | 3, PriorityMeta> = {
  1: {
    label: "P1 · Alta",
    short: "P1",
    badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20 font-semibold",
    dotColor: "bg-red-500",
  },
  2: {
    label: "P2 · Média",
    short: "P2",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-medium",
    dotColor: "bg-amber-500",
  },
  3: {
    label: "P3 · Baixa",
    short: "P3",
    badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
    dotColor: "bg-slate-400",
  },
};

export function getPriorityConfig(priority: number): PriorityMeta {
  if (priority === 1 || priority === 2 || priority === 3) {
    return PRIORITY_CONFIG[priority];
  }
  return PRIORITY_CONFIG[3];
}

export function parseChecklist(raw: ChecklistItem[] | string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface KanbanStats {
  totalActive: number;
  pendentes: number;
  emCurso: number;
  realizados: number;
  arquivados: number;
  taxaConclusao: number; // 0 a 100 com 1 casa decimal
  pendentePct: number;
  emCursoPct: number;
  realizadoPct: number;
  p1Count: number;
  totalChecklistItems: number;
  completedChecklistItems: number;
  checklistProgressPct: number;
}

/** Calcula estatísticas matemáticas detalhadas para painel de gestão */
export function calculateKanbanStats(notes: NoteLike[], archivedCount = 0): KanbanStats {
  const active = notes.filter((n) => !n.isArchived);
  const totalActive = active.length;
  const pendentes = active.filter((n) => n.status === "pendente").length;
  const emCurso = active.filter((n) => n.status === "em_curso").length;
  const realizados = active.filter((n) => n.status === "realizado").length;
  const p1Count = active.filter((n) => n.priority === 1).length;

  const round = (val: number) => Math.round(val * 10) / 10;

  const taxaConclusao = totalActive > 0 ? round((realizados / totalActive) * 100) : 0;
  const pendentePct = totalActive > 0 ? round((pendentes / totalActive) * 100) : 0;
  const emCursoPct = totalActive > 0 ? round((emCurso / totalActive) * 100) : 0;
  const realizadoPct = totalActive > 0 ? round((realizados / totalActive) * 100) : 0;

  let totalChecklistItems = 0;
  let completedChecklistItems = 0;
  for (const n of active) {
    const items = parseChecklist(n.checklist);
    totalChecklistItems += items.length;
    completedChecklistItems += items.filter((i) => i.done).length;
  }
  const checklistProgressPct =
    totalChecklistItems > 0 ? round((completedChecklistItems / totalChecklistItems) * 100) : 0;

  return {
    totalActive,
    pendentes,
    emCurso,
    realizados,
    arquivados: archivedCount,
    taxaConclusao,
    pendentePct,
    emCursoPct,
    realizadoPct,
    p1Count,
    totalChecklistItems,
    completedChecklistItems,
    checklistProgressPct,
  };
}

export type SortOption = "priority" | "recent" | "oldest" | "alphabetical" | "reminder";

export function sortNotes<T extends NoteLike>(list: T[], sortBy: SortOption = "priority"): T[] {
  return [...list].sort((a, b) => {
    // Pinned sempre no topo
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;

    switch (sortBy) {
      case "priority":
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "recent":
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "alphabetical":
        return a.title.localeCompare(b.title, "pt-BR");
      case "reminder":
        if (a.reminderAt && b.reminderAt) return a.reminderAt.localeCompare(b.reminderAt);
        return a.reminderAt ? -1 : b.reminderAt ? 1 : 0;
      default:
        return 0;
    }
  });
}

