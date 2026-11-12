"use client";
import React, { useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckSquare,
  Clock,
  Copy,
  Edit2,
  MoreHorizontal,
  Pin,
  Square,
  Tag,
  Trash2,
} from "lucide-react";
import { getPriorityConfig, NOTE_STATUS_META } from "@/lib/notes-logic";
import { cn } from "@/lib/utils";
import type { NoteItem, NoteStatus } from "./types";

interface NoteCardProps {
  key?: string;
  note: NoteItem;
  timezone?: string;
  onEdit: (note: NoteItem) => void;
  onDuplicate: (note: NoteItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, newStatus: NoteStatus) => void;
  onArchiveToggle: (id: string, archive: boolean) => void;
  onPinToggle: (id: string, pin: boolean) => void;
  onChecklistToggle?: (noteId: string, itemId: string, done: boolean) => void;
  isDragging?: boolean;
}

export function NoteCard({
  note,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  onArchiveToggle,
  onPinToggle,
  onChecklistToggle,
  isDragging = false,
}: NoteCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [checklistExpanded, setChecklistExpanded] = useState(false);

  const meta = NOTE_STATUS_META[note.status];
  const prio = getPriorityConfig(note.priority);

  const checklist = note.checklist || [];
  const completedChecklistCount = checklist.filter((i) => i.done).length;
  const checklistTotal = checklist.length;
  const checklistPct =
    checklistTotal > 0 ? Math.round((completedChecklistCount / checklistTotal) * 100) : 0;

  // Lembrete formatado
  const reminderDate = note.reminderAt ? new Date(note.reminderAt) : null;
  const isOverdue =
    reminderDate && note.status !== "realizado" && reminderDate.getTime() < Date.now();
  const isToday =
    reminderDate && reminderDate.toDateString() === new Date().toDateString();

  const formatReminder = (date: Date) => {
    const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Hoje às ${time}`;
    return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${time}`;
  };

  // Clique no checkbox principal do card
  const handleMainCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (note.status === "pendente" || note.status === "em_curso") {
      // Conclui o card (muda para Realizado verde)
      onStatusChange(note.id, "realizado");
    } else {
      // Já está em Realizado: arquiva o card
      onArchiveToggle(note.id, true);
    }
  };

  // Movimentação rápida entre colunas
  const canMoveLeft = note.status !== "pendente";
  const canMoveRight = note.status !== "realizado";

  const moveLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (note.status === "realizado") onStatusChange(note.id, "em_curso");
    else if (note.status === "em_curso") onStatusChange(note.id, "pendente");
  };

  const moveRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (note.status === "pendente") onStatusChange(note.id, "em_curso");
    else if (note.status === "em_curso") onStatusChange(note.id, "realizado");
  };

  return (
    <div
      draggable
      onDragStart={(e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", note.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border bg-card p-3.5 shadow-xs transition-all duration-200 select-none",
        meta.cardBorderClass,
        meta.cardBgClass,
        note.isPinned && "ring-1 ring-amber-500/40 shadow-sm",
        isDragging && "opacity-40 scale-95",
        "hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <div>
        {/* Linha superior: Checkbox + Status badge + Prio + Pin + Menu */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Checkbox executivo */}
            <button
              type="button"
              onClick={handleMainCheckbox}
              className={cn(
                "flex size-5.5 items-center justify-center rounded-md border transition-all cursor-pointer",
                note.status === "realizado"
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-xs hover:bg-emerald-700"
                  : "border-muted-foreground/40 bg-background/80 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40",
              )}
              title={
                note.status === "realizado"
                  ? "Clique para arquivar este card"
                  : "Clique para marcar como realizado"
              }
              aria-label={
                note.status === "realizado" ? "Arquivar card" : "Marcar como realizado"
              }
            >
              {note.status === "realizado" ? (
                <Check className="size-3.5 stroke-[3]" />
              ) : (
                <div className="size-2 rounded-xs opacity-0 transition-opacity group-hover:opacity-30 bg-current" />
              )}
            </button>

            {/* Badge de Status */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight",
                meta.badgeClass,
              )}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: meta.accentColor }}
              />
              {meta.singular}
            </span>

            {/* Badge de Prioridade */}
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px]",
                prio.badgeClass,
              )}
            >
              {prio.short}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Botão de Fixar 📌 */}
            <button
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onPinToggle(note.id, !note.isPinned);
              }}
              className={cn(
                "flex size-6.5 items-center justify-center rounded-md transition-colors",
                note.isPinned
                  ? "text-amber-500 hover:text-amber-600 bg-amber-500/10"
                  : "text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground",
              )}
              title={note.isPinned ? "Desafixar nota" : "Fixar no topo"}
            >
              <Pin className={cn("size-3.5", note.isPinned && "fill-current rotate-45")} />
            </button>

            {/* Menu Dropdown de Ações */}
            <div className="relative">
              <button
                type="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Mais opções"
              >
                <MoreHorizontal className="size-3.5" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                    }}
                  />
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-36 rounded-xl border border-border bg-popover p-1 text-xs shadow-lg animate-in fade-in-0 zoom-in-95">
                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onEdit(note);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <Edit2 className="size-3.5 text-muted-foreground" />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onDuplicate(note);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <Copy className="size-3.5 text-muted-foreground" />
                      <span>Duplicar</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onArchiveToggle(note.id, !note.isArchived);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <Archive className="size-3.5 text-muted-foreground" />
                      <span>{note.isArchived ? "Desarquivar" : "Arquivar"}</span>
                    </button>

                    <div className="my-1 border-t border-border/50" />

                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onDelete(note.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Título da Nota */}
        <div
          onClick={() => onEdit(note)}
          className="mt-2.5 cursor-pointer"
        >
          <h3
            className={cn(
              "text-sm font-semibold tracking-tight text-foreground line-clamp-2 leading-snug",
              note.status === "realizado" && "text-muted-foreground line-through decoration-emerald-600/50",
            )}
          >
            {note.title}
          </h3>

          {/* Conteúdo / Detalhes em texto */}
          {note.content && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-line">
              {note.content}
            </p>
          )}
        </div>

        {/* Checklist com itens interativos */}
        {checklistTotal > 0 && (
          <div className="mt-3 rounded-lg border border-border/50 bg-background/50 p-2 text-xs">
            {/* Barra de progresso */}
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <CheckSquare className="size-3 text-muted-foreground" />
                <span>Checklist</span>
              </span>
              <span className="font-mono text-[10px] font-semibold">
                {completedChecklistCount}/{checklistTotal} ({checklistPct}%)
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  note.status === "realizado"
                    ? "bg-emerald-500"
                    : note.status === "em_curso"
                      ? "bg-amber-500"
                      : "bg-rose-500",
                )}
                style={{ width: `${checklistPct}%` }}
              />
            </div>

            {/* Itens do Checklist */}
            <div className="mt-2 space-y-1">
              {(checklistExpanded ? checklist : checklist.slice(0, 3)).map((item) => (
                <div
                  key={item.id}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onChecklistToggle?.(note.id, item.id, !item.done);
                  }}
                  className="flex items-start gap-2 py-0.5 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <button
                    type="button"
                    className="mt-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {item.done ? (
                      <CheckSquare className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Square className="size-3.5" />
                    )}
                  </button>
                  <span
                    className={cn(
                      "text-xs leading-tight flex-1",
                      item.done && "line-through text-muted-foreground/60",
                    )}
                  >
                    {item.text}
                  </span>
                </div>
              ))}

              {checklistTotal > 3 && (
                <button
                  type="button"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setChecklistExpanded(!checklistExpanded);
                  }}
                  className="mt-1 text-[10px] font-medium text-primary hover:underline"
                >
                  {checklistExpanded
                    ? "Mostrar menos"
                    : `+ ${checklistTotal - 3} itens restantes`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rodapé do Card: Lembrete + Tags + Botões de mover */}
      <div className="mt-3.5 pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Lembrete / Data */}
          {reminderDate && (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                isOverdue
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 font-semibold animate-pulse"
                  : isToday
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
              )}
              title={isOverdue ? "Atenção: Prazo/lembrete vencido!" : "Data do lembrete"}
            >
              <Clock className="size-2.5" />
              <span>{formatReminder(reminderDate)}</span>
            </div>
          )}

          {/* Tag */}
          {note.tag && (
            <div className="inline-flex items-center gap-1 rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
              <Tag className="size-2.5" />
              <span>{note.tag}</span>
            </div>
          )}
        </div>

        {/* Botões de navegação rápida de coluna (⬅️ ➡️) */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {canMoveLeft && (
            <button
              type="button"
              onClick={moveLeft}
              className="flex size-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              title={
                note.status === "realizado"
                  ? "Mover para Em Curso"
                  : "Mover para Pendente"
              }
            >
              <ArrowLeft className="size-3" />
            </button>
          )}

          {canMoveRight && (
            <button
              type="button"
              onClick={moveRight}
              className="flex size-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              title={
                note.status === "pendente"
                  ? "Mover para Em Curso"
                  : "Mover para Realizado"
              }
            >
              <ArrowRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

