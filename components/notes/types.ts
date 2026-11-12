import type { NoteStatus } from "@/lib/validation";
import type { ChecklistItem } from "@/lib/notes-logic";

export type { ChecklistItem, NoteStatus };

export interface NoteItem {
  id: string;
  title: string;
  content: string | null;
  status: NoteStatus;
  priority: number;
  tag: string | null;
  categoryId: string | null;
  isArchived: boolean;
  isPinned: boolean;
  checklist: ChecklistItem[];
  reminderAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotePayload {
  title: string;
  content?: string | null;
  status: NoteStatus;
  priority: number;
  tag?: string | null;
  categoryId?: string | null;
  isArchived?: boolean;
  isPinned?: boolean;
  checklist?: ChecklistItem[];
  reminderAt?: string | null;
  color?: string | null;
}

export type ViewMode = "kanban" | "table";

export const PRESET_TAGS = [
  "Gestão",
  "Estratégia",
  "Finanças",
  "Projetos",
  "Operações",
  "Ideias",
  "Contratos",
  "Pessoal",
];

