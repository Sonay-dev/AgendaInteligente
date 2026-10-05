"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Circle, ListChecks, MessageCircleReply, Plus, RefreshCw, Search, Trash2, UserRound } from "lucide-react";
import { refreshCounts } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Category } from "@/components/agenda/api";
import { PRIORITY_DOT } from "@/components/agenda/view-utils";
import { parseQuickAdd } from "@/lib/nlp/parse-pt";
import { BUCKET_LABEL, TASK_STATUS_LABEL, daysWaiting, draftToTask, dueToIso, groupTasks, isOverdue } from "@/lib/tasks-logic";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TaskForm, type TaskFormInitial } from "./task-form";
import { formatDue, type Subtask, type Task, type TaskPayload } from "./types";

type Scope = "abertas" | "aguardando" | "concluidas";
const SCOPES: { id: Scope; label: string }[] = [
  { id: "abertas", label: "Abertas" },
  { id: "aguardando", label: "Aguardando" },
  { id: "concluidas", label: "Concluídas" },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function TasksClient({ timezone: tz }: { timezone: string }) {
  const [scope, setScope] = useState<Scope>("abertas");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [prios, setPrios] = useState<number[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState("");
  const [form, setForm] = useState<{ open: boolean; key: number; initial: TaskFormInitial }>({ open: false, key: 0, initial: {} });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    const r = await api<{ tasks: Task[] }>(`/api/tasks?scope=${scope}`);
    if (id !== seq.current) return;
    setLoading(false);
    if (r.ok) {
      setTasks(r.data.tasks);
      setError(null);
    } else setError(r.error);
  }, [scope]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const r = await api<{ categories: Category[] }>("/api/categories");
      if (r.ok) setCategories(r.data.categories);
    })();
  }, []);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return tasks.filter(
      (t) =>
        (!prios.length || prios.includes(t.priority)) &&
        (!cats.length || cats.includes(t.categoryId ?? "none")) &&
        (!q || `${t.title} ${t.notes ?? ""} ${t.assignee ?? ""}`.toLocaleLowerCase("pt-BR").includes(q)),
    );
  }, [tasks, prios, cats, query]);
  const quickDraft = useMemo(() => (quick.trim() ? parseQuickAdd(quick, new Date(), tz) : null), [quick, tz]);
  const filtered = prios.length + cats.length + (query.trim() ? 1 : 0) > 0;

  const openForm = (initial: TaskFormInitial) => setForm((f) => ({ open: true, key: f.key + 1, initial }));

  async function changeScope(next: Scope) {
    if (next === scope) return;
    setLoading(true);
    setTasks([]);
    setScope(next);
  }

  async function quickCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!quickDraft) return;
    const d = draftToTask(quickDraft, quick);
    const payload: TaskPayload = {
      title: d.title,
      dueAt: d.dueDate ? dueToIso(d.dueDate, d.dueTime, tz) : null,
      dueAllDay: !d.dueTime,
      priority: d.priority,
      status: "a_fazer",
      categoryId: null,
    };
    const r = await api<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    if (!r.ok) return void toast.error("Não foi possível criar", { description: r.error });
    setQuick("");
    toast.success("Tarefa criada", { description: r.data.task.title, action: { label: "Editar", onClick: () => openForm({ task: r.data.task }) } });
    refreshCounts();
    if (scope === "abertas") await load();
  }

  async function save(payload: TaskPayload): Promise<{ error?: string } | void> {
    const editing = form.initial.task;
    const r = editing
      ? await api<{ task: Task }>(`/api/tasks/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    if (!r.ok) return { error: r.error };
    toast.success(editing ? "Tarefa atualizada" : "Tarefa criada", { description: payload.title });
    setForm((f) => ({ ...f, open: false }));
    refreshCounts();
    await load();
  }

  async function patch(t: Task, body: Record<string, unknown>, okMsg?: string) {
    const r = await api<{ task: Task }>(`/api/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (!r.ok) {
      toast.error("Não foi possível salvar", { description: r.error });
    } else if (okMsg) toast.success(okMsg, { description: t.title });
    refreshCounts();
    await load();
  }

  async function complete(t: Task) {
    const done = t.status !== "concluida";
    // otimista: some da lista (ou volta) na hora
    setTasks((list) => list.filter((x) => x.id !== t.id));
    await patch(t, { status: done ? "concluida" : "a_fazer" });
    if (done)
      toast.success("Concluída", { description: t.title, action: { label: "Desfazer", onClick: () => void patch(t, { status: t.status }) } });
  }

  async function remove(t: Task) {
    setTasks((list) => list.filter((x) => x.id !== t.id));
    const r = await api(`/api/tasks/${t.id}`, { method: "DELETE" });
    if (r.ok) toast.success("Tarefa excluída", { description: t.title });
    else toast.error("Não foi possível excluir", { description: r.error });
    refreshCounts();
    await load();
  }

  const onChecklistChange = (taskId: string, subtasks: Subtask[]) =>
    setTasks((list) => list.map((t) => (t.id === taskId ? { ...t, subtasks } : t)));

  const now = new Date();
  const rowProps = {
    timezone: tz,
    catMap,
    onOpen: (t: Task) => openForm({ task: t }),
    onComplete: (t: Task) => void complete(t),
    onDelete: (t: Task) => void remove(t),
    onContacted: (t: Task) => void patch(t, { lastContactAt: new Date().toISOString() }, "Contato registrado"),
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-3 pb-24">
      <header>
        <h1 className="text-lg font-semibold">Tarefas</h1>
        <p className="text-xs text-muted-foreground">Só no app por enquanto (Google Tasks desligado).</p>
      </header>

      <form onSubmit={quickCreate} className="space-y-1.5">
        <div className="relative">
          <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            aria-label="Nova tarefa rápida"
            placeholder="Ex.: enviar proposta urgente amanhã 9h"
            className="h-11 rounded-xl pl-9 text-base"
            enterKeyHint="done"
            autoComplete="off"
          />
        </div>
        {quickDraft && (
          <p className="flex flex-wrap items-center gap-1 px-1 text-xs text-muted-foreground" aria-live="polite">
            <span className="font-medium text-foreground">{draftToTask(quickDraft, quick).title}</span>
            {quickDraft.recognized
              .filter((r) => r.kind !== "repeticao" && r.kind !== "duracao")
              .map((r, i) => (
                <span key={i} className="rounded-full bg-muted px-2 py-0.5 font-medium">
                  {r.label}
                </span>
              ))}
            <span className="ml-auto">Enter cria</span>
          </p>
        )}
      </form>

      <div role="tablist" aria-label="Tarefas" className="grid grid-cols-3 rounded-lg bg-muted p-0.5">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={scope === s.id}
            onClick={() => void changeScope(s.id)}
            className={cn("rounded-md py-1.5 text-sm font-medium transition-colors", scope === s.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefas" aria-label="Buscar tarefas" className="h-9 pl-8" />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Filtros">
          {[1, 2, 3].map((p) => (
            <FilterChip key={p} active={prios.includes(p)} onClick={() => setPrios((l) => toggle(l, p))}>
              <span className={cn("size-2 rounded-full", PRIORITY_DOT[p])} aria-hidden />P{p}
            </FilterChip>
          ))}
          <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
          {categories.map((c) => (
            <FilterChip key={c.id} active={cats.includes(c.id)} onClick={() => setCats((l) => toggle(l, c.id))}>
              <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
              {c.name}
            </FilterChip>
          ))}
          <FilterChip active={cats.includes("none")} onClick={() => setCats((l) => toggle(l, "none"))}>
            Sem categoria
          </FilterChip>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm">
          <AlertCircle className="size-6 text-destructive" aria-hidden />
          <p>
            Não foi possível carregar as tarefas <span className="text-muted-foreground">({error})</span>.
          </p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw aria-hidden /> Tentar de novo
          </Button>
        </div>
      ) : loading ? (
        <div className="animate-pulse space-y-2" role="status" aria-label="Carregando">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted" />
          ))}
        </div>
      ) : !visible.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <ListChecks className="size-6" aria-hidden />
          {filtered ? (
            <>
              <p>Nenhuma tarefa com esses filtros.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPrios([]);
                  setCats([]);
                  setQuery("");
                }}
              >
                Limpar filtros
              </Button>
            </>
          ) : scope === "abertas" ? (
            <p>Nenhuma tarefa aberta. Digite acima para criar.</p>
          ) : scope === "aguardando" ? (
            <p>Nada aguardando outras pessoas.</p>
          ) : (
            <p>Nenhuma tarefa concluída nos últimos 30 dias.</p>
          )}
        </div>
      ) : scope === "abertas" ? (
        <div className="space-y-4">
          {groupTasks(visible, now, tz).map(({ bucket, items }) => (
            <section key={bucket} aria-label={BUCKET_LABEL[bucket]}>
              <h2
                className={cn(
                  "sticky top-0 z-10 bg-background/95 py-1 text-xs font-semibold tracking-wide uppercase backdrop-blur",
                  bucket === "atrasadas" ? "text-red-600" : "text-muted-foreground",
                )}
              >
                {BUCKET_LABEL[bucket]} · {items.length}
              </h2>
              <ul className={cn("divide-y rounded-xl border", bucket === "atrasadas" && "border-red-500/40")}>
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} {...rowProps} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((t) => (
            <TaskRow key={t.id} task={t} {...rowProps} />
          ))}
        </ul>
      )}

      <Button
        size="icon-lg"
        aria-label="Nova tarefa"
        className="fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-lg"
        onClick={() => openForm({})}
      >
        <Plus className="size-6" aria-hidden />
      </Button>

      <TaskForm
        key={form.key}
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        initial={form.initial}
        timezone={tz}
        categories={categories}
        onSubmit={save}
        onChecklistChange={onChecklistChange}
      />
    </main>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

interface RowProps {
  task: Task;
  timezone: string;
  catMap: Map<string, Category>;
  onOpen: (t: Task) => void;
  onComplete: (t: Task) => void;
  onDelete: (t: Task) => void;
  onContacted: (t: Task) => void;
}

function TaskRow({ task: t, timezone: tz, catMap, onOpen, onComplete, onDelete, onContacted }: RowProps) {
  const now = new Date();
  const done = t.status === "concluida";
  const overdue = isOverdue(t, now, tz);
  const cat = t.categoryId ? catMap.get(t.categoryId) : undefined;
  const doneItems = t.subtasks.filter((s) => s.done).length;
  const waiting = t.status === "aguardando" ? daysWaiting(t, now, tz) : null;

  return (
    <li className={cn("group flex items-center gap-1.5 px-1.5 py-1.5", overdue && "bg-red-500/5")}>
      <Button variant="ghost" size="icon-sm" aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"} onClick={() => onComplete(t)}>
        {done ? <CheckCircle2 className="text-emerald-600" aria-hidden /> : <Circle className={overdue ? "text-red-500" : "text-muted-foreground"} aria-hidden />}
      </Button>
      <button type="button" className="min-w-0 flex-1 py-0.5 text-left" onClick={() => onOpen(t)}>
        <span className={cn("flex items-center gap-1.5 text-sm font-medium", done && "text-muted-foreground line-through", overdue && "text-red-600 dark:text-red-400")}>
          {t.priority < 3 && <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} aria-label={`prioridade P${t.priority}`} />}
          <span className="truncate">{t.title}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {t.dueAt && <span className={cn("tabular-nums", overdue && "font-medium text-red-600 dark:text-red-400")}>{overdue ? "atrasada · " : ""}{formatDue(t.dueAt, t.dueAllDay, tz, now)}</span>}
          {done && t.completedAt && <span>concluída {formatDateTime(t.completedAt, tz)}</span>}
          {t.status === "em_andamento" && <span className="rounded bg-sky-500/10 px-1 text-sky-700 dark:text-sky-300">{TASK_STATUS_LABEL.em_andamento}</span>}
          {t.status === "aguardando" && (
            <span className="inline-flex items-center gap-0.5">
              <UserRound className="size-3" aria-hidden />
              {t.assignee || "alguém"}
              {waiting !== null && (
                <span className={cn("ml-1", waiting >= 7 ? "font-medium text-red-600" : waiting >= 3 ? "font-medium text-amber-600" : "")}>
                  · {waiting === 0 ? "contato hoje" : `${waiting} dia${waiting > 1 ? "s" : ""} sem retorno`}
                </span>
              )}
            </span>
          )}
          {t.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <ListChecks className="size-3" aria-hidden />
              {doneItems}/{t.subtasks.length}
            </span>
          )}
          {cat && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: cat.color }} aria-hidden />
              {cat.name}
            </span>
          )}
        </span>
      </button>
      {t.status === "aguardando" && (
        <Button variant="outline" size="sm" onClick={() => onContacted(t)} aria-label={`Registrar que cobrou ${t.assignee ?? ""} hoje`}>
          <MessageCircleReply aria-hidden /> <span className="hidden sm:inline">Cobrei</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Excluir tarefa"
        className="sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        onClick={() => onDelete(t)}
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}
