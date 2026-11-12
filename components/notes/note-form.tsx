"use client";
import React, { useState } from "react";
import {
  Check,
  CheckSquare,
  Clock,
  Loader2,
  Pin,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_STATUS_META, PRIORITY_CONFIG, type ChecklistItem } from "@/lib/notes-logic";
import { cn } from "@/lib/utils";
import { PRESET_TAGS, type NoteItem, type NotePayload, type NoteStatus } from "./types";

interface NoteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<NoteItem> | null;
  defaultStatus?: NoteStatus;
  onSubmit: (payload: NotePayload) => Promise<void>;
}

export function NoteForm(props: NoteFormProps) {
  if (!props.open) return null;
  return <NoteFormInner {...props} />;
}

function NoteFormInner({
  open,
  onOpenChange,
  initial,
  defaultStatus = "pendente",
  onSubmit,
}: NoteFormProps) {
  const isEditing = Boolean(initial?.id);

  const [title, setTitle] = useState<string>(initial?.title ?? "");
  const [content, setContent] = useState<string>(initial?.content ?? "");
  const [status, setStatus] = useState<NoteStatus>(
    initial?.status ?? defaultStatus,
  );
  const currentStatus: NoteStatus = status;
  const [priority, setPriority] = useState<number>(initial?.priority ?? 2);
  const [tag, setTag] = useState<string>(initial?.tag ?? "");
  const [isPinned, setIsPinned] = useState<boolean>(initial?.isPinned ?? false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    initial?.checklist ?? [],
  );
  const currentChecklist: ChecklistItem[] = checklist;
  const [newChecklistText, setNewChecklistText] = useState<string>("");

  // Lembrete
  const initialDateStr = initial?.reminderAt
    ? new Date(initial.reminderAt).toISOString().slice(0, 10)
    : "";
  const initialTimeStr = initial?.reminderAt
    ? new Date(initial.reminderAt).toISOString().slice(11, 16)
    : "";

  const [reminderDate, setReminderDate] = useState<string>(initialDateStr);
  const [reminderTime, setReminderTime] = useState<string>(initialTimeStr);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Adicionar item ao checklist
  const handleAddChecklistItem = () => {
    const text = newChecklistText.trim();
    if (!text) return;
    setChecklist((prev: ChecklistItem[]) => [
      ...prev,
      { id: crypto.randomUUID(), text, done: false },
    ]);
    setNewChecklistText("");
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklist((prev: ChecklistItem[]) => prev.filter((it: ChecklistItem) => it.id !== id));
  };

  const handleToggleChecklistItem = (id: string) => {
    setChecklist((prev: ChecklistItem[]) =>
      prev.map((it: ChecklistItem) => (it.id === id ? { ...it, done: !it.done } : it)),
    );
  };

  // Atalhos de lembrete
  const setQuickReminder = (type: "hoje18" | "amanha09" | "seg09") => {
    const now = new Date();
    if (type === "hoje18") {
      setReminderDate(now.toISOString().slice(0, 10));
      setReminderTime("18:00");
    } else if (type === "amanha09") {
      const tomorrow = new Date(now.getTime() + 86400000);
      setReminderDate(tomorrow.toISOString().slice(0, 10));
      setReminderTime("09:00");
    } else if (type === "seg09") {
      const d = new Date(now);
      const day = d.getDay();
      const diff = (8 - day) % 7 || 7;
      d.setDate(d.getDate() + diff);
      setReminderDate(d.toISOString().slice(0, 10));
      setReminderTime("09:00");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Por favor, informe o título da anotação.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let reminderIso: string | null = null;
      if (reminderDate) {
        const time = reminderTime || "09:00";
        reminderIso = new Date(`${reminderDate}T${time}:00`).toISOString();
      }

      await onSubmit({
        title: title.trim(),
        content: content.trim() || null,
        status,
        priority,
        tag: tag.trim() || null,
        isPinned,
        checklist,
        reminderAt: reminderIso,
      });

      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar anotação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto sm:max-w-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: NOTE_STATUS_META[currentStatus].accentColor }}
            />
            {isEditing ? "Editar Anotação" : "Nova Anotação"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          {/* Título da Anotação */}
          <div className="space-y-1.5">
            <Label htmlFor="note-title" className="text-xs font-semibold">
              Título da Anotação <span className="text-destructive">*</span>
            </Label>
            <Input
              id="note-title"
              placeholder="Ex: Alinhamento de Metas Trimestrais, Análise do DRE..."
              value={title}
              onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
              className="h-9 font-medium"
              autoFocus
              required
            />
          </div>

          {/* Seleção de Coluna / Status (Cores Vivas e Bem Visíveis) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Status / Coluna</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["pendente", "em_curso", "realizado"] as const).map((s) => {
                const meta = NOTE_STATUS_META[s];
                const active = currentStatus === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition-all cursor-pointer",
                      active
                        ? cn(meta.cardBgClass, meta.badgeClass, "ring-2", meta.glowClass)
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: meta.accentColor }}
                    />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prioridade & Fixar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nível de Prioridade</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([1, 2, 3] as const).map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  const active = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition-colors cursor-pointer",
                        active
                          ? cn(cfg.badgeClass, "border-current shadow-xs")
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span className={cn("size-2 rounded-full", cfg.dotColor)} />
                      <span>{cfg.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Destaque</Label>
              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={cn(
                  "flex h-8.5 w-full items-center justify-center gap-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer",
                  isPinned
                    ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <Pin className={cn("size-3.5", isPinned && "fill-current rotate-45")} />
                <span>{isPinned ? "Fixada no Topo (Ativo)" : "Fixar no topo da coluna"}</span>
              </button>
            </div>
          </div>

          {/* Categoria / Tag com Chips Rápidos */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="note-tag" className="text-xs font-semibold">
                Tag / Categoria de Gestão
              </Label>
              {tag && (
                <button
                  type="button"
                  onClick={() => setTag("")}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Limpar tag
                </button>
              )}
            </div>
            <Input
              id="note-tag"
              placeholder="Digite ou selecione abaixo..."
              value={tag}
              onChange={(e: { target: { value: string } }) => setTag(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESET_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(t)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                    tag === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Conteúdo / Detalhes em Texto */}
          <div className="space-y-1.5">
            <Label htmlFor="note-content" className="text-xs font-semibold">
              Detalhes & Anotações
            </Label>
            <Textarea
              id="note-content"
              placeholder="Descreva detalhes, premissas, links ou notas de acompanhamento..."
              value={content}
              onChange={(e: { target: { value: string } }) => setContent(e.target.value)}
              rows={3}
              className="resize-y text-xs leading-relaxed"
            />
          </div>

          {/* Checklist Interativo */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CheckSquare className="size-3.5 text-primary" />
                <span>Sub-itens / Checklist</span>
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {currentChecklist.filter((i: ChecklistItem) => i.done).length}/{currentChecklist.length} concluídos
              </span>
            </div>

            {/* Input de novo item */}
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar item ao checklist... (Enter)"
                value={newChecklistText}
                onChange={(e: { target: { value: string } }) => setNewChecklistText(e.target.value)}
                onKeyDown={(e: { key: string; preventDefault: () => void }) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddChecklistItem();
                  }
                }}
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddChecklistItem}
                className="h-8 px-2.5 text-xs"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>

            {/* Lista de itens */}
            {currentChecklist.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 pt-1">
                {currentChecklist.map((item: ChecklistItem) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/80 px-2.5 py-1 text-xs"
                  >
                    <div
                      onClick={() => handleToggleChecklistItem(item.id)}
                      className="flex items-center gap-2 flex-1 cursor-pointer"
                    >
                      <button
                        type="button"
                        className={cn(
                          "size-4 rounded-md border flex items-center justify-center transition-colors",
                          item.done
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-muted-foreground/50",
                        )}
                      >
                        {item.done && <Check className="size-3 stroke-[3]" />}
                      </button>
                      <span
                        className={cn(
                          "text-xs",
                          item.done && "line-through text-muted-foreground/60",
                        )}
                      >
                        {item.text}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(item.id)}
                      className="text-muted-foreground/50 hover:text-destructive p-0.5"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lembrete / Prazo */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Clock className="size-3.5 text-primary" />
                <span>Lembrete & Data de Acompanhamento</span>
              </span>
              {reminderDate && (
                <button
                  type="button"
                  onClick={() => {
                    setReminderDate("");
                    setReminderTime("");
                  }}
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                >
                  Remover lembrete
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={reminderDate}
                onChange={(e: { target: { value: string } }) => setReminderDate(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                type="time"
                value={reminderTime}
                onChange={(e: { target: { value: string } }) => setReminderTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setQuickReminder("hoje18")}
                className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Hoje 18:00
              </button>
              <button
                type="button"
                onClick={() => setQuickReminder("amanha09")}
                className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Amanhã 09:00
              </button>
              <button
                type="button"
                onClick={() => setQuickReminder("seg09")}
                className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Segunda 09:00
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !title.trim()}
              className="gap-2 text-xs font-semibold"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              <span>{isEditing ? "Salvar Alterações" : "Criar Anotação"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

