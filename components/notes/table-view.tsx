"use client";
import {
  Archive,
  Check,
  Clock,
  Copy,
  Edit2,
  Pin,
  Tag,
  Trash2,
} from "lucide-react";
import { getPriorityConfig, NOTE_STATUS_META } from "@/lib/notes-logic";
import { cn } from "@/lib/utils";
import type { NoteItem, NoteStatus } from "./types";

interface TableViewProps {
  notes: NoteItem[];
  timezone?: string;
  onEdit: (note: NoteItem) => void;
  onDuplicate: (note: NoteItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, newStatus: NoteStatus) => void;
  onArchiveToggle: (id: string, archive: boolean) => void;
  onPinToggle: (id: string, pin: boolean) => void;
}

export function TableView({
  notes,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  onArchiveToggle,
  onPinToggle,
}: TableViewProps) {
  if (notes.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-card/40">
        <p className="text-sm font-semibold text-foreground">
          Nenhuma anotação encontrada com os filtros atuais
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Ajuste a busca ou crie uma nova anotação para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="py-3 pl-4 pr-2 w-10 text-center">Status</th>
            <th className="py-3 px-3">Coluna</th>
            <th className="py-3 px-3">Prioridade</th>
            <th className="py-3 px-3 min-w-[220px]">Título & Detalhes</th>
            <th className="py-3 px-3">Tag</th>
            <th className="py-3 px-3">Checklist</th>
            <th className="py-3 px-3">Lembrete</th>
            <th className="py-3 pr-4 pl-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {notes.map((note) => {
            const meta = NOTE_STATUS_META[note.status];
            const prio = getPriorityConfig(note.priority);
            const checklist = note.checklist || [];
            const completedCount = checklist.filter((i) => i.done).length;
            const totalCount = checklist.length;
            const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

            const reminderDate = note.reminderAt ? new Date(note.reminderAt) : null;
            const isOverdue =
              reminderDate &&
              note.status !== "realizado" &&
              reminderDate.getTime() < Date.now();

            return (
              <tr
                key={note.id}
                className={cn(
                  "group transition-colors hover:bg-muted/40",
                  note.isPinned && "bg-amber-500/5",
                )}
              >
                {/* Checkbox de Status */}
                <td className="py-3 pl-4 pr-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (note.status !== "realizado") onStatusChange(note.id, "realizado");
                      else onArchiveToggle(note.id, true);
                    }}
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-md border transition-all cursor-pointer",
                      note.status === "realizado"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-600",
                    )}
                    title={
                      note.status === "realizado"
                        ? "Arquivar card"
                        : "Marcar como realizado"
                    }
                  >
                    {note.status === "realizado" ? (
                      <Check className="size-3.5 stroke-[3]" />
                    ) : null}
                  </button>
                </td>

                {/* Coluna / Status (Select rápido ou Badge) */}
                <td className="py-3 px-3">
                  <select
                    value={note.status}
                    onChange={(e: { target: { value: string } }) =>
                      onStatusChange(note.id, e.target.value as NoteStatus)
                    }
                    className={cn(
                      "rounded-lg border px-2 py-1 text-xs font-semibold outline-none cursor-pointer",
                      meta.badgeClass,
                    )}
                  >
                    <option value="pendente">🔴 Pendente</option>
                    <option value="em_curso">🟡 Em Curso</option>
                    <option value="realizado">🟢 Realizado</option>
                  </select>
                </td>

                {/* Prioridade */}
                <td className="py-3 px-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      prio.badgeClass,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", prio.dotColor)} />
                    {prio.label}
                  </span>
                </td>

                {/* Título & Detalhes */}
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    {note.isPinned && (
                      <Pin className="size-3.5 fill-amber-500 text-amber-500 rotate-45 shrink-0" />
                    )}
                    <div>
                      <span
                        onClick={() => onEdit(note)}
                        className={cn(
                          "font-semibold text-foreground hover:underline cursor-pointer",
                          note.status === "realizado" &&
                            "line-through text-muted-foreground decoration-emerald-600/50",
                        )}
                      >
                        {note.title}
                      </span>
                      {note.content && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {note.content}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Tag */}
                <td className="py-3 px-3">
                  {note.tag ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Tag className="size-2.5" />
                      {note.tag}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>

                {/* Checklist */}
                <td className="py-3 px-3 font-mono">
                  {totalCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {completedCount}/{totalCount} ({pct}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>

                {/* Lembrete */}
                <td className="py-3 px-3">
                  {reminderDate ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        isOverdue
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 font-semibold"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Clock className="size-3" />
                      {reminderDate.toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>

                {/* Ações */}
                <td className="py-3 pr-4 pl-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onPinToggle(note.id, !note.isPinned)}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md transition-colors",
                        note.isPinned
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      title={note.isPinned ? "Desafixar" : "Fixar"}
                    >
                      <Pin className={cn("size-3.5", note.isPinned && "fill-current rotate-45")} />
                    </button>

                    <button
                      type="button"
                      onClick={() => onEdit(note)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Editar"
                    >
                      <Edit2 className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicate(note)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Duplicar"
                    >
                      <Copy className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onArchiveToggle(note.id, true)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Arquivar"
                    >
                      <Archive className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(note.id)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Excluir"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

