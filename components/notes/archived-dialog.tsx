"use client";
import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  RotateCcw,
  Search,
  Tag,
  Trash2,
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
import { getPriorityConfig, NOTE_STATUS_META } from "@/lib/notes-logic";
import { cn } from "@/lib/utils";
import type { NoteItem } from "./types";

interface ArchivedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archivedNotes: NoteItem[];
  onRestore: (id: string) => void;
  onDeletePermanent: (id: string) => void;
  onRestoreAll?: () => void;
}

export function ArchivedDialog({
  open,
  onOpenChange,
  archivedNotes,
  onRestore,
  onDeletePermanent,
  onRestoreAll,
}: ArchivedDialogProps) {
  const [search, setSearch] = useState("");

  const filtered = archivedNotes.filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      (n.content && n.content.toLowerCase().includes(q)) ||
      (n.tag && n.tag.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-5">
        <DialogHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Archive className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Notas & Lembretes Arquivados
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Consulte ou restaure qualquer item para o quadro ativo a qualquer momento
                </p>
              </div>
            </div>

            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {archivedNotes.length} no arquivo
            </span>
          </div>

          {/* Busca no arquivo */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar nas notas arquivadas..."
              value={search}
              onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
              className="h-8 pl-9 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Lista de Notas Arquivadas */}
        <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1">
          {filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
              <Archive className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-semibold text-foreground">
                {search ? "Nenhuma nota encontrada com esta busca" : "O arquivo está vazio"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {search
                  ? "Tente buscar por outro termo ou limpe o campo de pesquisa."
                  : "Quando você marca ou arquiva notas no quadro, elas ficam guardadas com segurança aqui."}
              </p>
            </div>
          ) : (
            filtered.map((note) => {
              const meta = NOTE_STATUS_META[note.status];
              const prio = getPriorityConfig(note.priority);
              const archivedDate = note.archivedAt ? new Date(note.archivedAt) : null;
              const checklist = note.checklist || [];

              return (
                <div
                  key={note.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-border hover:bg-muted/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          meta.badgeClass,
                        )}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: meta.accentColor }}
                        />
                        {meta.singular}
                      </span>

                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px]",
                          prio.badgeClass,
                        )}
                      >
                        {prio.short}
                      </span>

                      {note.tag && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Tag className="size-2.5" />
                          <span>{note.tag}</span>
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-foreground truncate">
                      {note.title}
                    </h4>

                    {note.content && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {note.content}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      {archivedDate && (
                        <span>
                          Arquivado em{" "}
                          {archivedDate.toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}

                      {checklist.length > 0 && (
                        <span className="flex items-center gap-1 font-mono">
                          <CheckSquare className="size-3" />
                          <span>
                            {checklist.filter((i) => i.done).length}/{checklist.length} itens
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRestore(note.id)}
                      className="h-8 gap-1.5 text-xs font-semibold text-primary hover:bg-primary/10 hover:border-primary/50"
                      title="Restaurar de volta para o Kanban"
                    >
                      <RotateCcw className="size-3.5" />
                      <span>Desarquivar</span>
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeletePermanent(note.id)}
                      className="size-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Excluir permanentemente"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border/50 flex flex-row items-center justify-between sm:justify-between">
          {archivedNotes.length > 0 && onRestoreAll && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRestoreAll}
              className="text-xs gap-1.5"
            >
              <ArchiveRestore className="size-3.5" />
              <span>Desarquivar Todas</span>
            </Button>
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

