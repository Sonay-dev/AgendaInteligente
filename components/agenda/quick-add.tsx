"use client";
import { useMemo, useState } from "react";
import { CornerDownLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseQuickAdd, type QuickDraft } from "@/lib/nlp/parse-pt";
import { cn } from "@/lib/utils";

const KIND_CLASS: Record<QuickDraft["recognized"][number]["kind"], string> = {
  data: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  hora: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  duracao: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  repeticao: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  prioridade: "bg-red-500/10 text-red-700 dark:text-red-300",
};

/** Frase em português → rascunho; Enter abre o formulário preenchido para confirmar. */
export function QuickAdd({ timezone, onDraft }: { timezone: string; onDraft: (draft: QuickDraft) => void }) {
  const [text, setText] = useState("");
  const draft = useMemo(() => (text.trim() ? parseQuickAdd(text, new Date(), timezone) : null), [text, timezone]);

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft) return;
        onDraft(draft);
        setText("");
      }}
    >
      <div className="relative">
        <Sparkles className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Criação rápida"
          placeholder="Ex.: reunião com João amanhã às 15h por 1h"
          className="h-11 rounded-xl pr-12 pl-9 text-base"
          enterKeyHint="done"
          autoComplete="off"
        />
        <Button type="submit" size="icon-sm" variant="ghost" className="absolute top-1/2 right-1.5 -translate-y-1/2" disabled={!draft} aria-label="Revisar e criar">
          <CornerDownLeft aria-hidden />
        </Button>
      </div>
      {draft && (
        <p className="flex flex-wrap items-center gap-1 px-1 text-xs text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">{draft.title || "(sem título)"}</span>
          {draft.recognized.map((r, i) => (
            <span key={i} className={cn("rounded-full px-2 py-0.5 font-medium", KIND_CLASS[r.kind])}>
              {r.label}
            </span>
          ))}
          {!draft.recognized.length && <span>· sem data/hora reconhecida (hoje, dia inteiro)</span>}
          <span className="ml-auto hidden sm:inline">Enter para revisar</span>
        </p>
      )}
    </form>
  );
}
