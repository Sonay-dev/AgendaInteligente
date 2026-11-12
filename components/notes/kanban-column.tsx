"use client";
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { NOTE_STATUS_META } from "@/lib/notes-logic";
import { cn } from "@/lib/utils";
import { NoteCard } from "./note-card";
import type { NoteItem, NoteStatus } from "./types";

interface KanbanColumnProps {
  status: NoteStatus;
  notes: NoteItem[];
  timezone?: string;
  onAddCard: (status: NoteStatus) => void;
  onEdit: (note: NoteItem) => void;
  onDuplicate: (note: NoteItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, newStatus: NoteStatus) => void;
  onArchiveToggle: (id: string, archive: boolean) => void;
  onPinToggle: (id: string, pin: boolean) => void;
  onChecklistToggle?: (noteId: string, itemId: string, done: boolean) => void;
  onDropCard: (noteId: string, targetStatus: NoteStatus) => void;
}

export function KanbanColumn({
  status,
  notes,
  timezone,
  onAddCard,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  onArchiveToggle,
  onPinToggle,
  onChecklistToggle,
  onDropCard,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const meta = NOTE_STATUS_META[status];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const noteId = e.dataTransfer.getData("text/plain");
    if (noteId) {
      onDropCard(noteId, status);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col rounded-2xl border border-border/80 bg-muted/30 p-3 sm:p-4 transition-all duration-200 min-h-[460px]",
        meta.columnBorderClass,
        isDragOver && "ring-2 ring-primary/40 bg-muted/60 scale-[1.01]",
      )}
    >
      {/* Cabeçalho da Coluna */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: meta.accentColor }}
          />
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            {meta.label}
          </h3>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold leading-none min-w-5",
              meta.columnBadgeClass,
            )}
          >
            {notes.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onAddCard(status)}
          className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
          title={`Adicionar em ${meta.label}`}
          aria-label={`Adicionar nota em ${meta.label}`}
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Lista de Cards da Coluna */}
      <div className="flex-1 space-y-3 overflow-y-auto pr-0.5">
        {notes.length === 0 ? (
          <div
            onClick={() => onAddCard(status)}
            className="flex h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-background/30 p-4 text-center cursor-pointer transition-colors hover:border-primary/40 hover:bg-background/60"
          >
            <p className="text-xs font-medium text-muted-foreground">
              Nenhuma anotação {meta.label.toLowerCase()}
            </p>
            <span className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-primary">
              <Plus className="size-3" />
              <span>Criar nota aqui</span>
            </span>
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              timezone={timezone}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onArchiveToggle={onArchiveToggle}
              onPinToggle={onPinToggle}
              onChecklistToggle={onChecklistToggle}
            />
          ))
        )}
      </div>
    </div>
  );
}

