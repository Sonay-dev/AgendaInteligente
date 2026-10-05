"use client";
import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Category } from "@/components/agenda/api";
import { TASK_STATUS, TASK_STATUS_LABEL, dueToIso, type TaskStatus } from "@/lib/tasks-logic";
import { zoned } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Subtask, Task, TaskPayload } from "./types";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface TaskFormInitial {
  task?: Task;
  draft?: { title: string; dueDate: string | null; dueTime: string | null; priority: number };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TaskFormInitial;
  timezone: string;
  categories: Category[];
  title?: string;
  onSubmit: (payload: TaskPayload) => Promise<{ error?: string } | void>;
  /** Checklist de tarefa existente mudou (salvo na hora, fora do "Salvar"). */
  onChecklistChange?: (taskId: string, subtasks: Subtask[]) => void;
}

export function TaskForm(props: Props) {
  return props.open ? <TaskFormInner {...props} /> : null;
}

function TaskFormInner({ open, onOpenChange, initial, timezone, categories, title: dialogTitle, onSubmit, onChecklistChange }: Props) {
  const task = initial.task;
  const draft = initial.draft;
  const due = task?.dueAt ? zoned(new Date(task.dueAt), timezone) : null;

  const [title, setTitle] = useState(task?.title ?? draft?.title ?? "");
  const [dueDate, setDueDate] = useState(due?.ymd ?? draft?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task ? (task.dueAllDay ? "" : (due?.hm ?? "")) : (draft?.dueTime ?? ""));
  const [priority, setPriority] = useState(task?.priority ?? draft?.priority ?? 3);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "a_fazer");
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? "");
  const [assignee, setAssignee] = useState(task?.assignee ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  // checklist: tarefa nova → lista local enviada no "Salvar"; existente → cada mudança vai direto à API
  const [items, setItems] = useState<Subtask[]>(task?.subtasks ?? []);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateItems = (next: Subtask[]) => {
    setItems(next);
    if (task) onChecklistChange?.(task.id, next);
  };

  async function addItem() {
    const text = newItem.trim();
    if (!text) return;
    setNewItem("");
    if (!task) return updateItems([...items, { id: crypto.randomUUID(), title: text, done: false, position: items.length }]);
    const r = await api<{ subtask: Subtask }>(`/api/tasks/${task.id}/subtasks`, { method: "POST", body: JSON.stringify({ title: text }) });
    if (r.ok) updateItems([...items, r.data.subtask]);
    else toast.error("Não foi possível adicionar", { description: r.error });
  }

  async function toggleItem(it: Subtask) {
    const next = items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x));
    updateItems(next);
    if (!task) return;
    const r = await api(`/api/tasks/${task.id}/subtasks/${it.id}`, { method: "PATCH", body: JSON.stringify({ done: !it.done }) });
    if (!r.ok) {
      toast.error("Não foi possível atualizar", { description: r.error });
      updateItems(items);
    }
  }

  async function removeItem(it: Subtask) {
    updateItems(items.filter((x) => x.id !== it.id));
    if (!task) return;
    const r = await api(`/api/tasks/${task.id}/subtasks/${it.id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("Não foi possível remover", { description: r.error });
      updateItems(items);
    }
  }

  async function submit() {
    setError(null);
    if (dueTime && !dueDate) return setError("Escolha a data do prazo (ou apague a hora).");
    const payload: TaskPayload = {
      title: title.trim(),
      notes: notes.trim() || null,
      dueAt: dueDate ? dueToIso(dueDate, dueTime || null, timezone) : null,
      dueAllDay: !dueTime,
      priority,
      status,
      categoryId: categoryId || null,
      assignee: status === "aguardando" ? assignee.trim() || null : (task?.assignee ?? null),
      ...(task ? {} : { subtasks: items.map((i) => i.title) }),
    };
    setSaving(true);
    const res = await onSubmit(payload);
    setSaving(false);
    if (res?.error) setError(res.error);
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle ?? (task ? "Editar tarefa" : draft ? "Confirme a tarefa" : "Nova tarefa")}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="t-title">Título</Label>
            <Input id="t-title" required autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="t-date">Prazo</Label>
              <Input id="t-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-time">Hora (opcional)</Label>
              <Input id="t-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>
          {(dueDate || dueTime) && (
            <button
              type="button"
              className="-mt-1 justify-self-start text-xs text-muted-foreground underline underline-offset-4"
              onClick={() => {
                setDueDate("");
                setDueTime("");
              }}
            >
              Sem prazo
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="t-priority">Prioridade</Label>
              <select id="t-priority" className={selectClass} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>P1 urgente</option>
                <option value={2}>P2 importante</option>
                <option value={3}>P3 normal</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-status">Status</Label>
              <select id="t-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {TASK_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {status === "aguardando" && (
            <div className="grid gap-1.5">
              <Label htmlFor="t-assignee">Aguardando quem?</Label>
              <Input id="t-assignee" maxLength={120} placeholder="Ex.: João do financeiro" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="t-category">Categoria</Label>
            <select id="t-category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium">
              Checklist
              {items.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {doneCount}/{items.length}
                </span>
              )}
            </legend>
            {items.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={it.done}
                      onChange={() => void toggleItem(it)}
                      aria-label={`Concluir item: ${it.title}`}
                    />
                    <span className={cn("min-w-0 flex-1 text-sm break-words", it.done && "text-muted-foreground line-through")}>{it.title}</span>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remover ${it.title}`} onClick={() => void removeItem(it)}>
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newItem}
                maxLength={200}
                placeholder="Adicionar item"
                aria-label="Novo item do checklist"
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addItem();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" aria-label="Adicionar item" disabled={!newItem.trim()} onClick={() => void addItem()}>
                <Plus aria-hidden />
              </Button>
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="t-notes">Notas</Label>
            <Textarea id="t-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
