"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  Columns3,
  Kanban as KanbanIcon,
  Plus,
  Search,
  Table as TableIcon,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateKanbanStats, sortNotes, type SortOption } from "@/lib/notes-logic";
import { cn } from "@/lib/utils";
import { ArchivedDialog } from "./archived-dialog";
import { KanbanColumn } from "./kanban-column";
import { KpiDashboard } from "./kpi-dashboard";
import { NoteForm } from "./note-form";
import { TableView } from "./table-view";
import {
  PRESET_TAGS,
  type ChecklistItem,
  type NoteItem,
  type NotePayload,
  type NoteStatus,
  type ViewMode,
} from "./types";

interface RawNoteItem extends Omit<NoteItem, "checklist" | "isArchived" | "isPinned"> {
  isArchived?: boolean | number;
  isPinned?: boolean | number;
  checklist?: ChecklistItem[] | string | null;
}

interface NotesApiResponse {
  notes?: RawNoteItem[];
}

interface LocalNotesCache {
  notes?: NoteItem[];
  archived?: NoteItem[];
}

const LOCAL_STORAGE_KEY = "agenda_notes_v1";

const DEMO_SEED_NOTES: NoteItem[] = [
  {
    id: "demo-note-1",
    title: "Fechamento Mensal e Validação das Conciliações",
    content: "Cruzar relatórios bancários com o sistema de gestão financeira e validar provisões.",
    status: "pendente",
    priority: 1,
    tag: "Finanças",
    categoryId: null,
    isArchived: false,
    isPinned: true,
    checklist: [
      { id: "c1", text: "Exportar extratos consolidados", done: false },
      { id: "c2", text: "Cruzar relatórios com o razão contábil", done: false },
      { id: "c3", text: "Emitir parecer do DRE para a diretoria", done: false },
    ],
    reminderAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    completedAt: null,
    archivedAt: null,
    color: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-note-2",
    title: "Planejamento Estratégico Q1 — OKRs & Metas",
    content: "Estruturação dos indicadores chave de desempenho para o próximo trimestre.",
    status: "em_curso",
    priority: 1,
    tag: "Estratégia",
    categoryId: null,
    isArchived: false,
    isPinned: false,
    checklist: [
      { id: "c4", text: "Mapeamento dos gargalos operacionais", done: true },
      { id: "c5", text: "Definição de 3 objetivos centrais com lideranças", done: true },
      { id: "c6", text: "Validação da planilha de metas numéricas", done: false },
    ],
    reminderAt: new Date(Date.now() + 86400000 * 4).toISOString(),
    completedAt: null,
    archivedAt: null,
    color: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-note-3",
    title: "Revisão dos SLAs e Fluxo de Entrega de Processos",
    content: "Auditar tempos médios de resposta do atendimento e apontar desvios padrão.",
    status: "pendente",
    priority: 2,
    tag: "Gestão",
    categoryId: null,
    isArchived: false,
    isPinned: false,
    checklist: [
      { id: "c7", text: "Exportar planilha de chamados dos últimos 30 dias", done: false },
      { id: "c8", text: "Calcular métricas de tempo médio de resolução (TMR)", done: false },
    ],
    reminderAt: null,
    completedAt: null,
    archivedAt: null,
    color: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-note-4",
    title: "Alinhamento com Diretoria e Aprovação de Diretrizes",
    content: "Reunião executiva de validação do orçamento e revisão do organograma.",
    status: "realizado",
    priority: 2,
    tag: "Gestão",
    categoryId: null,
    isArchived: false,
    isPinned: false,
    checklist: [
      { id: "c9", text: "Elaborar apresentação com os pontos principais", done: true },
      { id: "c10", text: "Coletar assinaturas na ata de reunião", done: true },
    ],
    reminderAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    archivedAt: null,
    color: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-note-5",
    title: "Auditoria e Renovação de Certificados Digitais",
    content: "Certificados das empresas do grupo com validade checada e atualizada.",
    status: "realizado",
    priority: 3,
    tag: "Operações",
    categoryId: null,
    isArchived: false,
    isPinned: false,
    checklist: [{ id: "c11", text: "Backup dos tokens em cofre seguro", done: true }],
    reminderAt: null,
    completedAt: new Date().toISOString(),
    archivedAt: null,
    color: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

interface NotesClientProps {
  timezone?: string;
}

export function NotesClient({ timezone = "America/Sao_Paulo" }: NotesClientProps) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [archivedNotes, setArchivedNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros e controles
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<number | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<NoteStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  // Diálogos
  const [formOpen, setFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [defaultColumn, setDefaultColumn] = useState<NoteStatus>("pendente");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const seq = useRef(0);

  // Carregamento de Notas
  const loadNotes = useCallback(async () => {
    const id = ++seq.current;
    try {
      const [resActive, resArchived] = await Promise.all([
        fetch("/api/notes?archived=false"),
        fetch("/api/notes?archived=true"),
      ]);

      if (id !== seq.current) return;

      if (resActive.ok && resArchived.ok) {
        const dataActive = (await resActive.json()) as NotesApiResponse;
        const dataArchived = (await resArchived.json()) as NotesApiResponse;
        const activeItems = dataActive.notes ?? [];
        const archivedItems = dataArchived.notes ?? [];

        // Se o banco estiver vazio no primeiro acesso, inicializamos com as anotações modelo para o usuário
        if (activeItems.length === 0 && archivedItems.length === 0) {
          const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as LocalNotesCache;
              setNotes(parsed.notes || []);
              setArchivedNotes(parsed.archived || []);
              setLoading(false);
              return;
            } catch {
              // segue para o seed padrão
            }
          }

          // Grava seed local
          setNotes(DEMO_SEED_NOTES);
          setArchivedNotes([]);
          localStorage.setItem(
            LOCAL_STORAGE_KEY,
            JSON.stringify({ notes: DEMO_SEED_NOTES, archived: [] }),
          );
        } else {
          // Normaliza do banco
          const normalize = (items: RawNoteItem[]): NoteItem[] =>
            items.map((it: RawNoteItem) => ({
              ...it,
              isArchived: Boolean(it.isArchived),
              isPinned: Boolean(it.isPinned),
              checklist:
                typeof it.checklist === "string"
                  ? (JSON.parse(it.checklist || "[]") as ChecklistItem[])
                  : it.checklist || [],
            }));

          setNotes(normalize(activeItems));
          setArchivedNotes(normalize(archivedItems));
        }
      } else {
        // Fallback local se a API der erro ou offline
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as LocalNotesCache;
          setNotes(parsed.notes || []);
          setArchivedNotes(parsed.archived || []);
        } else {
          setNotes(DEMO_SEED_NOTES);
        }
      }
    } catch {
      // Fallback local em caso de erro de rede
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as LocalNotesCache;
          setNotes(parsed.notes || []);
          setArchivedNotes(parsed.archived || []);
        } catch {}
      } else {
        setNotes(DEMO_SEED_NOTES);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // Salva no localStorage como cópia de segurança
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ notes, archived: archivedNotes }),
      );
    }
  }, [notes, archivedNotes, loading]);

  // Lista de tags únicas disponíveis
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      if (n.tag) set.add(n.tag);
    }
    for (const t of PRESET_TAGS) {
      set.add(t);
    }
    return Array.from(set);
  }, [notes]);

  // Cálculo de KPIs
  const stats = useMemo(() => {
    return calculateKanbanStats(notes, archivedNotes.length);
  }, [notes, archivedNotes]);

  // Filtragem e ordenação
  const filteredNotes = useMemo(() => {
    let result = notes.filter((n: NoteItem) => !n.isArchived);

    // Filtro por texto
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (n: NoteItem) =>
          n.title.toLowerCase().includes(q) ||
          (n.content && n.content.toLowerCase().includes(q)) ||
          (n.tag && n.tag.toLowerCase().includes(q)) ||
          n.checklist.some((item: ChecklistItem) => item.text.toLowerCase().includes(q)),
      );
    }

    // Filtro por prioridade
    if (priorityFilter !== "all") {
      result = result.filter((n: NoteItem) => n.priority === priorityFilter);
    }

    // Filtro por tag
    if (tagFilter !== "all") {
      result = result.filter((n: NoteItem) => n.tag === tagFilter);
    }

    // Filtro por status
    if (statusFilter !== "all") {
      result = result.filter((n: NoteItem) => n.status === statusFilter);
    }

    return sortNotes(result, sortBy);
  }, [notes, query, priorityFilter, tagFilter, statusFilter, sortBy]);

  // Agrupamento por coluna Kanban
  const pendentesNotes = useMemo(
    () => filteredNotes.filter((n: NoteItem) => n.status === "pendente"),
    [filteredNotes],
  );
  const emCursoNotes = useMemo(
    () => filteredNotes.filter((n: NoteItem) => n.status === "em_curso"),
    [filteredNotes],
  );
  const realizadosNotes = useMemo(
    () => filteredNotes.filter((n: NoteItem) => n.status === "realizado"),
    [filteredNotes],
  );

  // AÇÕES
  // 1. Abrir formulário para nova nota
  const handleOpenNewNote = (status: NoteStatus = "pendente") => {
    setDefaultColumn(status);
    setEditingNote(null);
    setFormOpen(true);
  };

  // 2. Abrir formulário para editar nota existente
  const handleOpenEdit = (note: NoteItem) => {
    setEditingNote(note);
    setFormOpen(true);
  };

  // 3. Salvar (criar ou atualizar) nota
  const handleSaveNote = async (payload: NotePayload) => {
    if (editingNote) {
      // Atualização
      const updatedItem: NoteItem = {
        ...editingNote,
        ...payload,
        checklist: payload.checklist || [],
        updatedAt: new Date().toISOString(),
      };

      setNotes((prev: NoteItem[]) =>
        prev.map((n: NoteItem) => (n.id === editingNote.id ? updatedItem : n)),
      );

      toast.success("Anotação atualizada!");

      // Envia ao servidor
      fetch(`/api/notes/${editingNote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } else {
      // Criação
      const newId = crypto.randomUUID();
      const newItem: NoteItem = {
        id: newId,
        title: payload.title,
        content: payload.content ?? null,
        status: payload.status,
        priority: payload.priority,
        tag: payload.tag ?? null,
        categoryId: payload.categoryId ?? null,
        isArchived: false,
        isPinned: payload.isPinned ?? false,
        checklist: payload.checklist || [],
        reminderAt: payload.reminderAt ?? null,
        completedAt: payload.status === "realizado" ? new Date().toISOString() : null,
        archivedAt: null,
        color: payload.color ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setNotes((prev: NoteItem[]) => [newItem, ...prev]);
      toast.success("Nova anotação criada!");

      // Envia ao servidor
      fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  };

  // 4. Mudar status (ex: Pendente -> Em Curso -> Realizado)
  const handleStatusChange = (id: string, newStatus: NoteStatus) => {
    const target = notes.find((n: NoteItem) => n.id === id);
    if (!target) return;

    const oldStatus = target.status;
    const nowIso = new Date().toISOString();

    setNotes((prev: NoteItem[]) =>
      prev.map((n: NoteItem) =>
        n.id === id
          ? {
              ...n,
              status: newStatus,
              completedAt: newStatus === "realizado" ? nowIso : null,
              updatedAt: nowIso,
            }
          : n,
      ),
    );

    if (newStatus === "realizado") {
      toast.success("Card marcado como Realizado! 🟢", {
        description: "Você pode clicar no check para arquivá-lo se desejar.",
        action: {
          label: "Desfazer",
          onClick: () => handleStatusChange(id, oldStatus),
        },
      });
    } else {
      toast.info(`Card movido para ${newStatus === "em_curso" ? "Em Curso 🟡" : "Pendente 🔴"}`);
    }

    // API
    fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});
  };

  // 5. Arquivar ou Desarquivar Nota
  const handleArchiveToggle = (id: string, archive = true) => {
    if (archive) {
      const item = notes.find((n: NoteItem) => n.id === id);
      if (!item) return;

      const archivedItem: NoteItem = {
        ...item,
        isArchived: true,
        archivedAt: new Date().toISOString(),
      };

      setNotes((prev: NoteItem[]) => prev.filter((n: NoteItem) => n.id !== id));
      setArchivedNotes((prev: NoteItem[]) => [archivedItem, ...prev]);

      toast.success("Anotação arquivada!", {
        description: "Você pode vê-la a qualquer momento em 'Ver Arquivadas'.",
        action: {
          label: "Desfazer",
          onClick: () => handleArchiveToggle(id, false),
        },
      });

      fetch(`/api/notes/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      }).catch(() => {});
    } else {
      // Desarquivar
      const item = archivedNotes.find((n: NoteItem) => n.id === id);
      if (!item) return;

      const restoredItem: NoteItem = {
        ...item,
        isArchived: false,
        archivedAt: null,
      };

      setArchivedNotes((prev: NoteItem[]) => prev.filter((n: NoteItem) => n.id !== id));
      setNotes((prev: NoteItem[]) => [restoredItem, ...prev]);

      toast.success("Anotação restaurada para o quadro!");

      fetch(`/api/notes/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: false }),
      }).catch(() => {});
    }
  };

  // 6. Fixar / Desafixar
  const handlePinToggle = (id: string, pin: boolean) => {
    setNotes((prev: NoteItem[]) =>
      prev.map((n: NoteItem) => (n.id === id ? { ...n, isPinned: pin } : n)),
    );

    toast.info(pin ? "Nota fixada no topo 📌" : "Nota desafixada");

    fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: pin }),
    }).catch(() => {});
  };

  // 7. Toggle item de checklist
  const handleChecklistToggle = (noteId: string, itemId: string, done: boolean) => {
    const target = notes.find((n: NoteItem) => n.id === noteId);
    if (!target) return;

    const nextChecklist = target.checklist.map((it: ChecklistItem) =>
      it.id === itemId ? { ...it, done } : it,
    );

    setNotes((prev: NoteItem[]) =>
      prev.map((n: NoteItem) => (n.id === noteId ? { ...n, checklist: nextChecklist } : n)),
    );

    fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: nextChecklist }),
    }).catch(() => {});
  };

  // 8. Duplicar Nota
  const handleDuplicate = (note: NoteItem) => {
    const copy: NotePayload = {
      title: `${note.title} (Cópia)`,
      content: note.content,
      status: note.status,
      priority: note.priority,
      tag: note.tag,
      categoryId: note.categoryId,
      isPinned: false,
      checklist: note.checklist.map((c: ChecklistItem) => ({ ...c, id: crypto.randomUUID() })),
      reminderAt: note.reminderAt,
    };
    void handleSaveNote(copy);
  };

  // 9. Excluir Nota
  const handleDeleteNote = (id: string) => {
    setNotes((prev: NoteItem[]) => prev.filter((n: NoteItem) => n.id !== id));
    toast.success("Anotação excluída");
    fetch(`/api/notes/${id}`, { method: "DELETE" }).catch(() => {});
  };

  // 10. Excluir definitivamente das arquivadas
  const handleDeletePermanent = (id: string) => {
    setArchivedNotes((prev: NoteItem[]) => prev.filter((n: NoteItem) => n.id !== id));
    toast.success("Anotação removida definitivamente");
    fetch(`/api/notes/${id}`, { method: "DELETE" }).catch(() => {});
  };

  // 11. Desarquivar todas
  const handleRestoreAll = () => {
    const restored = archivedNotes.map((n: NoteItem) => ({
      ...n,
      isArchived: false,
      archivedAt: null,
    }));
    setNotes((prev: NoteItem[]) => [...restored, ...prev]);
    setArchivedNotes([]);
    toast.success("Todas as anotações foram restauradas!");
  };

  const hasActiveFilters =
    query.trim() !== "" ||
    priorityFilter !== "all" ||
    tagFilter !== "all" ||
    statusFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setPriorityFilter("all");
    setTagFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6">
      {/* Cabeçalho Principal da Tela */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <KanbanIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Quadro de Gestão & Anotações
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Kanban de alta visibilidade · Cards coloridos por status e controle executivo
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação do Topo */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Ver Arquivadas */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setArchivedOpen(true)}
            className="h-9 gap-2 text-xs font-semibold"
          >
            <Archive className="size-4 text-muted-foreground" />
            <span>Ver Arquivadas</span>
            {archivedNotes.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold">
                {archivedNotes.length}
              </span>
            )}
          </Button>

          {/* Botão Nova Anotação */}
          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenNewNote("pendente")}
            className="h-9 gap-1.5 text-xs font-bold shadow-sm cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Nova Anotação</span>
          </Button>
        </div>
      </div>

      {/* Painel Executivo de Métricas (Dashboard para exatas / TOC / gestão) */}
      <KpiDashboard
        stats={stats}
        onOpenArchived={() => setArchivedOpen(true)}
      />

      {/* Barra de Ferramentas e Filtros de Alta Precisão */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/60 p-3 shadow-xs backdrop-blur-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Busca em tempo real */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, texto, checklist ou tag..."
              value={query}
              onChange={(e: { target: { value: string } }) => setQuery(e.target.value)}
              className="h-9 pl-9 pr-8 text-xs font-medium"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Alternância de Visualização (Kanban vs Tabela) */}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Visualização em Colunas Kanban"
            >
              <Columns3 className="size-3.5" />
              <span>Kanban</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                viewMode === "table"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Visualização em Tabela / Matriz de Gestão"
            >
              <TableIcon className="size-3.5" />
              <span>Tabela</span>
            </button>
          </div>
        </div>

        {/* Linha de Filtros Rápidos (Prioridade, Tags, Ordenação) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-border/40">
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por Prioridade */}
            <div className="flex items-center gap-1 text-xs font-medium">
              <span className="text-[11px] text-muted-foreground mr-1 hidden sm:inline">
                Prioridade:
              </span>
              <button
                type="button"
                onClick={() => setPriorityFilter("all")}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                  priorityFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setPriorityFilter(1)}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-semibold transition-colors cursor-pointer",
                  priorityFilter === 1
                    ? "bg-rose-500 text-white"
                    : "bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20",
                )}
              >
                🔴 P1 Alta
              </button>
              <button
                type="button"
                onClick={() => setPriorityFilter(2)}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-semibold transition-colors cursor-pointer",
                  priorityFilter === 2
                    ? "bg-amber-500 text-white"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
                )}
              >
                🟡 P2 Média
              </button>
              <button
                type="button"
                onClick={() => setPriorityFilter(3)}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                  priorityFilter === 3
                    ? "bg-slate-700 text-white"
                    : "bg-slate-500/10 text-slate-700 dark:text-slate-400 hover:bg-slate-500/20",
                )}
              >
                P3 Baixa
              </button>
            </div>

            {/* Filtro por Tag */}
            {availableTags.length > 0 && (
              <div className="flex items-center gap-1">
                <Tag className="size-3 text-muted-foreground ml-1" />
                <select
                  value={tagFilter}
                  onChange={(e: { target: { value: string } }) => setTagFilter(e.target.value)}
                  className="h-7 rounded-lg border border-border/80 bg-background/80 px-2 text-xs font-medium outline-none cursor-pointer"
                >
                  <option value="all">Todas as Tags</option>
                  {availableTags.map((t: string) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Ordenação e Limpar Filtros */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden sm:inline">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e: { target: { value: string } }) => setSortBy(e.target.value as SortOption)}
              className="h-7 rounded-lg border border-border/80 bg-background/80 px-2 text-xs font-medium outline-none cursor-pointer"
            >
              <option value="priority">Prioridade (P1 Primeiro)</option>
              <option value="recent">Mais Recentes</option>
              <option value="oldest">Mais Antigas</option>
              <option value="reminder">Prazo / Lembrete</option>
              <option value="alphabetical">Alfabética (A-Z)</option>
            </select>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Visualização Principal: KANBAN ou TABELA */}
      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Coluna 1: 🔴 PENDENTES */}
          <KanbanColumn
            status="pendente"
            notes={pendentesNotes}
            timezone={timezone}
            onAddCard={handleOpenNewNote}
            onEdit={handleOpenEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDeleteNote}
            onStatusChange={handleStatusChange}
            onArchiveToggle={handleArchiveToggle}
            onPinToggle={handlePinToggle}
            onChecklistToggle={handleChecklistToggle}
            onDropCard={handleStatusChange}
          />

          {/* Coluna 2: 🟡 EM CURSO */}
          <KanbanColumn
            status="em_curso"
            notes={emCursoNotes}
            timezone={timezone}
            onAddCard={handleOpenNewNote}
            onEdit={handleOpenEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDeleteNote}
            onStatusChange={handleStatusChange}
            onArchiveToggle={handleArchiveToggle}
            onPinToggle={handlePinToggle}
            onChecklistToggle={handleChecklistToggle}
            onDropCard={handleStatusChange}
          />

          {/* Coluna 3: 🟢 REALIZADOS */}
          <KanbanColumn
            status="realizado"
            notes={realizadosNotes}
            timezone={timezone}
            onAddCard={handleOpenNewNote}
            onEdit={handleOpenEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDeleteNote}
            onStatusChange={handleStatusChange}
            onArchiveToggle={handleArchiveToggle}
            onPinToggle={handlePinToggle}
            onChecklistToggle={handleChecklistToggle}
            onDropCard={handleStatusChange}
          />
        </div>
      ) : (
        <TableView
          notes={filteredNotes}
          timezone={timezone}
          onEdit={handleOpenEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDeleteNote}
          onStatusChange={handleStatusChange}
          onArchiveToggle={handleArchiveToggle}
          onPinToggle={handlePinToggle}
        />
      )}

      {/* Modal de Criação / Edição de Anotação */}
      <NoteForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editingNote}
        defaultStatus={defaultColumn}
        onSubmit={handleSaveNote}
      />

      {/* Diálogo de Notas Arquivadas */}
      <ArchivedDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        archivedNotes={archivedNotes}
        onRestore={(id: string) => handleArchiveToggle(id, false)}
        onDeletePermanent={handleDeletePermanent}
        onRestoreAll={handleRestoreAll}
      />
    </div>
  );
}

