"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  CalendarPlus,
  Check,
  ListPlus,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  RefreshCw,
  SkipForward,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { refreshCounts } from "@/components/app-nav";
import { api, type Category, type Conflict, type EventPayload } from "@/components/agenda/api";
import { EventForm } from "@/components/agenda/event-form";
import { TaskForm } from "@/components/tasks/task-form";
import type { TaskPayload } from "@/components/tasks/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseQuickAdd } from "@/lib/nlp/parse-pt";
import { draftToTask } from "@/lib/tasks-logic";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useDictation } from "./use-dictation";

interface InboxItem {
  id: string;
  rawText: string;
  source: "digitado" | "voz";
  createdAt: string;
}

export function InboxClient({ timezone: tz }: { timezone: string }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [text, setText] = useState("");
  const [viaVoice, setViaVoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triage, setTriage] = useState<{ index: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [eventFor, setEventFor] = useState<InboxItem | null>(null);
  const [taskFor, setTaskFor] = useState<InboxItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dictation = useDictation(
    useCallback((chunk: string) => {
      if (!chunk) return;
      setText((t) => (t.trim() ? `${t.trim()} ${chunk}` : chunk));
      setViaVoice(true);
    }, []),
  );

  const load = useCallback(async () => {
    const r = await api<{ items: InboxItem[] }>("/api/inbox");
    setLoading(false);
    if (r.ok) {
      setItems(r.data.items);
      setError(null);
    } else setError(r.error);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      const r = await api<{ categories: Category[] }>("/api/categories");
      if (r.ok) setCategories(r.data.categories);
    })();
  }, [load]);

  // triagem: mais antigos primeiro (ordem de chegada)
  const queue = useMemo(() => [...items].reverse(), [items]);
  const current = triage ? queue[Math.min(triage.index, queue.length - 1)] : undefined;
  const draft = useMemo(() => (current ? parseQuickAdd(current.rawText, new Date(), tz) : null), [current, tz]);

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    const rawText = text.trim();
    if (!rawText) return;
    dictation.stop();
    setSaving(true);
    const r = await api<{ item: InboxItem }>("/api/inbox", { method: "POST", body: JSON.stringify({ rawText, source: viaVoice ? "voz" : "digitado" }) });
    setSaving(false);
    if (!r.ok) return void toast.error("Não foi possível guardar", { description: r.error });
    setItems((list) => [r.data.item, ...list]);
    setText("");
    setViaVoice(false);
    refreshCounts();
    inputRef.current?.focus();
  }

  /** Remove da lista local; na triagem mantém o índice (o próximo item "sobe"). */
  function processed(id: string) {
    setItems((list) => list.filter((x) => x.id !== id));
    refreshCounts();
    setTriage((t) => (t && queue.length <= 1 ? null : t));
  }

  async function discard(item: InboxItem) {
    const r = await api(`/api/inbox/${item.id}`, { method: "DELETE" });
    if (!r.ok) return void toast.error("Não foi possível descartar", { description: r.error });
    processed(item.id);
    toast("Descartado", { description: item.rawText });
  }

  async function saveEdit() {
    if (!editing) return;
    const rawText = editing.text.trim();
    if (!rawText) return;
    const r = await api<{ item: InboxItem }>(`/api/inbox/${editing.id}`, { method: "PATCH", body: JSON.stringify({ rawText }) });
    if (!r.ok) return void toast.error("Não foi possível salvar", { description: r.error });
    setItems((list) => list.map((x) => (x.id === editing.id ? r.data.item : x)));
    setEditing(null);
  }

  async function asEvent(payload: EventPayload): Promise<{ conflicts?: Conflict[]; error?: string } | void> {
    if (!eventFor) return;
    const r = await api(`/api/inbox/${eventFor.id}/triage`, { method: "POST", body: JSON.stringify({ as: "event", event: payload }) });
    if (!r.ok) return r.status === 409 && r.conflicts ? { conflicts: r.conflicts } : { error: r.error };
    toast.success("Virou compromisso", { description: payload.title });
    processed(eventFor.id);
    setEventFor(null);
  }

  async function asTask(payload: TaskPayload): Promise<{ error?: string } | void> {
    if (!taskFor) return;
    const r = await api(`/api/inbox/${taskFor.id}/triage`, { method: "POST", body: JSON.stringify({ as: "task", task: payload }) });
    if (!r.ok) return { error: r.error };
    toast.success("Virou tarefa", { description: payload.title });
    processed(taskFor.id);
    setTaskFor(null);
  }

  const startTriage = (item?: InboxItem) => setTriage({ index: item ? Math.max(0, queue.findIndex((q) => q.id === item.id)) : 0 });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-3 pb-24">
      <header className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Caixa de entrada</h1>
          <p className="text-xs text-muted-foreground">Anote agora, decida depois.</p>
        </div>
        {items.length > 0 && !triage && (
          <Button size="sm" onClick={() => startTriage()}>
            <Sparkles aria-hidden /> Triagem ({items.length})
          </Button>
        )}
      </header>

      {/* captura */}
      <form onSubmit={capture} className="space-y-1.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={dictation.listening && dictation.interim ? `${text} ${dictation.interim}`.trim() : text}
              onChange={(e) => setText(e.target.value)}
              readOnly={dictation.listening}
              aria-label="Capturar"
              placeholder={dictation.listening ? "Ouvindo…" : "O que está na sua cabeça?"}
              className={cn("h-11 rounded-xl text-base", dictation.listening && "border-red-500 ring-3 ring-red-500/20")}
              enterKeyHint="send"
              autoComplete="off"
              autoFocus
            />
          </div>
          {dictation.supported && (
            <Button
              type="button"
              variant={dictation.listening ? "destructive" : "outline"}
              className="size-11 rounded-xl"
              aria-label={dictation.listening ? "Parar ditado" : "Ditar por voz"}
              aria-pressed={dictation.listening}
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            >
              {dictation.listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
            </Button>
          )}
          <Button type="submit" className="h-11 rounded-xl" disabled={saving || !text.trim()}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            <span className="hidden sm:inline">Guardar</span>
          </Button>
        </div>
        {dictation.error && (
          <p role="alert" className="px-1 text-xs text-destructive">
            {dictation.error}
          </p>
        )}
        {!dictation.supported && <p className="px-1 text-xs text-muted-foreground">Ditado por voz indisponível neste navegador (use Chrome, Edge ou Safari).</p>}
      </form>

      {/* triagem: um item por vez */}
      {triage && current && draft && (
        <section aria-label="Triagem" className="space-y-3 rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Triagem · {Math.min(triage.index, queue.length - 1) + 1} de {queue.length}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setTriage(null)}>
              <X aria-hidden /> Sair
            </Button>
          </div>
          <p className="text-lg leading-snug font-medium break-words">{current.rawText}</p>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {current.source === "voz" && <Mic className="size-3" aria-label="ditado" />}
            {formatDateTime(current.createdAt, tz)}
            {draft.recognized.map((r, i) => (
              <span key={i} className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                {r.label}
              </span>
            ))}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button onClick={() => setEventFor(current)}>
              <CalendarPlus aria-hidden /> Compromisso
            </Button>
            <Button onClick={() => setTaskFor(current)}>
              <ListPlus aria-hidden /> Tarefa
            </Button>
            <Button variant="outline" onClick={() => void discard(current)}>
              <Trash2 aria-hidden /> Descartar
            </Button>
            <Button variant="ghost" onClick={() => setTriage({ index: (triage.index + 1) % queue.length })} disabled={queue.length < 2}>
              <SkipForward aria-hidden /> Pular
            </Button>
          </div>
        </section>
      )}

      {/* lista */}
      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm">
          <AlertCircle className="size-6 text-destructive" aria-hidden />
          <p>
            Não foi possível carregar a caixa de entrada <span className="text-muted-foreground">({error})</span>.
          </p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw aria-hidden /> Tentar de novo
          </Button>
        </div>
      ) : loading ? (
        <div className="animate-pulse space-y-2" role="status" aria-label="Carregando">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 rounded-xl bg-muted" />
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Check className="size-6" aria-hidden />
          <p className="font-medium text-foreground">Caixa vazia</p>
          <p>Tudo triado. Anote acima ou toque no microfone.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Itens para triar">
          {items.map((it) => (
            <li key={it.id} className={cn("group flex items-center gap-2 px-3 py-2", current?.id === it.id && "bg-primary/5")}>
              {editing?.id === it.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit();
                  }}
                >
                  <Input autoFocus value={editing.text} onChange={(e) => setEditing({ id: it.id, text: e.target.value })} aria-label="Editar texto" />
                  <Button type="submit" size="icon" aria-label="Salvar texto">
                    <Check aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Cancelar edição" onClick={() => setEditing(null)}>
                    <X aria-hidden />
                  </Button>
                </form>
              ) : (
                <>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => startTriage(it)}>
                    <span className="block text-sm break-words">{it.rawText}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {it.source === "voz" && <Mic className="size-3" aria-label="ditado" />}
                      {formatDateTime(it.createdAt, tz)}
                    </span>
                  </button>
                  <div className="flex sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <Button variant="ghost" size="icon-sm" aria-label="Editar texto" onClick={() => setEditing({ id: it.id, text: it.rawText })}>
                      <Pencil aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Descartar" onClick={() => void discard(it)}>
                      <Trash2 aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Triar este item" onClick={() => startTriage(it)}>
                      <ArrowRight aria-hidden />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <EventForm
        key={eventFor?.id ?? "ev"}
        open={!!eventFor}
        onOpenChange={(open) => !open && setEventFor(null)}
        initial={eventFor ? { draft: parseQuickAdd(eventFor.rawText, new Date(), tz) } : {}}
        timezone={tz}
        categories={categories}
        onSubmit={asEvent}
      />
      <TaskForm
        key={taskFor?.id ?? "task"}
        open={!!taskFor}
        onOpenChange={(open) => !open && setTaskFor(null)}
        initial={taskFor ? { draft: draftToTask(parseQuickAdd(taskFor.rawText, new Date(), tz), taskFor.rawText) } : {}}
        timezone={tz}
        categories={categories}
        title="Virar tarefa"
        onSubmit={asTask}
      />
    </main>
  );
}
