import { describe, expect, it } from "vitest";
import {
  calculateKanbanStats,
  NOTE_STATUS_META,
  sortNotes,
  type NoteLike,
} from "../lib/notes-logic";

const note = (extra: Partial<NoteLike>): NoteLike => ({
  id: "test-id",
  title: "Nota Teste",
  content: null,
  status: "pendente",
  priority: 3,
  tag: null,
  categoryId: null,
  isArchived: false,
  isPinned: false,
  checklist: [],
  reminderAt: null,
  completedAt: null,
  archivedAt: null,
  color: null,
  createdAt: "2026-11-12T10:00:00Z",
  updatedAt: "2026-11-12T10:00:00Z",
  ...extra,
});

describe("Cores e Metadados do Kanban (Notas)", () => {
  it("contém definições de status corretas: pendente vermelho, em curso amarelo, realizado verde", () => {
    expect(NOTE_STATUS_META.pendente.accentColor).toBe("#ef4444"); // Red
    expect(NOTE_STATUS_META.em_curso.accentColor).toBe("#f59e0b"); // Yellow/Amber
    expect(NOTE_STATUS_META.realizado.accentColor).toBe("#10b981"); // Green
  });
});

describe("calculateKanbanStats (Métricas de Gestão e Exatas)", () => {
  it("calcula taxa de conclusão, percentuais e contagens matemáticas exatas", () => {
    const list: NoteLike[] = [
      note({ id: "1", status: "pendente", priority: 1 }),
      note({ id: "2", status: "em_curso", priority: 2 }),
      note({ id: "3", status: "realizado", priority: 3 }),
      note({ id: "4", status: "realizado", priority: 1 }),
    ];

    const stats = calculateKanbanStats(list, 2);

    expect(stats.totalActive).toBe(4);
    expect(stats.pendentes).toBe(1);
    expect(stats.emCurso).toBe(1);
    expect(stats.realizados).toBe(2);
    expect(stats.arquivados).toBe(2);

    // 2 de 4 = 50.0%
    expect(stats.taxaConclusao).toBe(50.0);
    expect(stats.pendentePct).toBe(25.0);
    expect(stats.emCursoPct).toBe(25.0);
    expect(stats.realizadoPct).toBe(50.0);
    expect(stats.p1Count).toBe(2);
  });

  it("calcula progresso de checklists integrados", () => {
    const list: NoteLike[] = [
      note({
        checklist: [
          { id: "c1", text: "Item 1", done: true },
          { id: "c2", text: "Item 2", done: false },
        ],
      }),
      note({
        checklist: [
          { id: "c3", text: "Item 3", done: true },
          { id: "c4", text: "Item 4", done: true },
        ],
      }),
    ];

    const stats = calculateKanbanStats(list);
    expect(stats.totalChecklistItems).toBe(4);
    expect(stats.completedChecklistItems).toBe(3);
    expect(stats.checklistProgressPct).toBe(75.0);
  });

  it("trata lista vazia com precisão sem divisão por zero", () => {
    const stats = calculateKanbanStats([]);
    expect(stats.totalActive).toBe(0);
    expect(stats.taxaConclusao).toBe(0);
    expect(stats.checklistProgressPct).toBe(0);
  });
});

describe("sortNotes (Ordenação Estruturada)", () => {
  it("mantém notas fixadas (isPinned) sempre no topo", () => {
    const unpinnedP1 = note({ id: "1", priority: 1, isPinned: false });
    const pinnedP3 = note({ id: "2", priority: 3, isPinned: true });

    const sorted = sortNotes([unpinnedP1, pinnedP3], "priority");
    expect(sorted[0]!.id).toBe("2");
    expect(sorted[1]!.id).toBe("1");
  });

  it("ordena por prioridade: P1 antes de P2 antes de P3", () => {
    const p3 = note({ id: "3", priority: 3 });
    const p1 = note({ id: "1", priority: 1 });
    const p2 = note({ id: "2", priority: 2 });

    const sorted = sortNotes([p3, p1, p2], "priority");
    expect(sorted.map((n) => n.id)).toEqual(["1", "2", "3"]);
  });

  it("ordena alfabeticamente A-Z", () => {
    const b = note({ id: "b", title: "Beta" });
    const a = note({ id: "a", title: "Alfa" });
    const c = note({ id: "c", title: "Gama" });

    const sorted = sortNotes([c, b, a], "alphabetical");
    expect(sorted.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

