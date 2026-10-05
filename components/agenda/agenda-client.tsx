"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, CalendarPlus, ChevronLeft, ChevronRight, Loader2, LogOut, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import type { QuickDraft } from "@/lib/nlp/parse-pt";
import { cn } from "@/lib/utils";
import { api, type CalendarEvent, type Category, type Conflict, type EventPayload } from "./api";
import { EventForm, type FormInitial } from "./event-form";
import { FilterBar } from "./filters";
import { ListView } from "./list-view";
import { MonthView } from "./month-view";
import { QuickAdd } from "./quick-add";
import { TimeGrid } from "./time-grid";
import {
  EMPTY_FILTERS,
  LIST_DAYS,
  NEUTRAL_COLOR,
  VIEWS,
  VIEW_COOKIE,
  activeFilterCount,
  applyFilters,
  stepAnchor,
  todayYmd,
  viewDays,
  viewRange,
  viewTitle,
  type Filters,
  type View,
} from "./view-utils";

interface GoogleStatus {
  google: { status: "active" | "revoked" | "disconnected" | "never"; connected: boolean; email: string | null };
  pending: number;
}

interface Props {
  user: { email: string; name: string; timezone: string };
  initialView: View;
  initialAnchor: string;
}

export function AgendaClient({ user, initialView, initialAnchor }: Props) {
  const tz = user.timezone;
  const [view, setView] = useState<View>(initialView);
  const [anchor, setAnchor] = useState(initialAnchor);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<{ open: boolean; key: number; initial: FormInitial }>({ open: false, key: 0, initial: {} });
  const seq = useRef(0);

  const days = useMemo(() => viewDays(view, anchor, tz), [view, anchor, tz]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const visible = useMemo(() => applyFilters(events, filters), [events, filters]);
  const colorOf = useCallback((ev: CalendarEvent) => (ev.categoryId && catMap.get(ev.categoryId)?.color) || NEUTRAL_COLOR, [catMap]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    const { from, to } = viewRange(view, anchor, tz);
    const [evs, st] = await Promise.all([
      api<{ events: CalendarEvent[] }>(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      api<GoogleStatus>("/api/google/status"),
    ]);
    if (id !== seq.current) return; // resposta de uma navegação antiga
    setLoading(false);
    if (evs.ok) {
      setEvents(evs.data.events);
      setLoadError(null);
    } else setLoadError(evs.error);
    if (st.ok) setStatus(st.data);
  }, [view, anchor, tz]);

  useEffect(() => {
    // carrega ao abrir e a cada troca de visão/data; o setState acontece depois do await
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

  function navigate(nextView: View, nextAnchor: string) {
    if (nextView !== view || nextAnchor !== anchor) setLoading(true);
    setView(nextView);
    setAnchor(nextAnchor);
    const url = new URL(window.location.href);
    url.searchParams.set("v", nextView);
    url.searchParams.set("d", nextAnchor);
    window.history.replaceState(null, "", url);
    // lembra a visão preferida (lida no servidor → sem "piscar" na próxima visita)
    document.cookie = `${VIEW_COOKIE}=${nextView}; path=/; max-age=31536000; samesite=lax`;
  }

  const openCreate = (initial: FormInitial) => setForm((f) => ({ open: true, key: f.key + 1, initial }));

  async function syncNow() {
    setSyncing(true);
    const r = await api<{ pulled: { applied: number; deleted: number; conflicts: number; more: boolean } }>("/api/google/sync", { method: "POST" });
    setSyncing(false);
    if (r.ok) {
      const p = r.data.pulled;
      toast.success("Sincronizado com o Google", {
        description: `${p.applied} atualizados, ${p.deleted} removidos${p.conflicts ? `, ${p.conflicts} conflitos` : ""}${p.more ? " (continua…)" : ""}`,
      });
    } else toast.error("Falha ao sincronizar", { description: r.error });
    await load();
  }

  async function save(payload: EventPayload): Promise<{ conflicts?: Conflict[]; error?: string } | void> {
    const editing = form.initial.event;
    const r = editing
      ? await api(`/api/events/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/api/events", { method: "POST", body: JSON.stringify(payload) });
    if (!r.ok) return r.status === 409 ? { conflicts: r.conflicts } : { error: r.error };
    toast.success(editing ? "Compromisso atualizado" : "Compromisso criado", { description: payload.title });
    setForm((f) => ({ ...f, open: false }));
    await load();
  }

  async function openEdit(ev: CalendarEvent) {
    const r = await api<{ event: CalendarEvent & { reminders: { minutesBefore: number; method: "popup" | "email" }[] } }>(`/api/events/${ev.id}`);
    if (r.ok) openCreate({ event: { ...r.data.event, occurrenceStart: ev.occurrenceStart, occurrenceEnd: ev.occurrenceEnd } });
    else toast.error("Não foi possível abrir", { description: r.error });
  }

  async function move(ev: CalendarEvent, newStart: Date, allowConflicts = false) {
    const dur = new Date(ev.endAt).getTime() - new Date(ev.startAt).getTime();
    const payload = { startAt: newStart.toISOString(), endAt: new Date(newStart.getTime() + dur).toISOString(), allowConflicts };
    // otimista: move já na tela
    setEvents((list) => list.map((e) => (e.id === ev.id ? { ...e, ...payload, occurrenceStart: payload.startAt, occurrenceEnd: payload.endAt, syncStatus: "pending" } : e)));
    const r = await api(`/api/events/${ev.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    if (!r.ok && r.status === 409) {
      toast.warning("Conflito de horário", {
        description: r.conflicts?.map((c) => c.title).join(", "),
        action: { label: "Mover mesmo assim", onClick: () => void move(ev, newStart, true) },
      });
    } else if (!r.ok) toast.error("Não foi possível mover", { description: r.error });
    await load();
  }

  async function remove(ev: CalendarEvent) {
    const r = await api(`/api/events/${ev.id}`, { method: "DELETE" });
    if (r.ok) toast.success("Excluído", { description: ev.rrule ? `${ev.title} (toda a série)` : ev.title });
    else toast.error("Não foi possível excluir", { description: r.error });
    await load();
  }

  async function complete(ev: CalendarEvent) {
    setEvents((list) => list.map((e) => (e.id === ev.id ? { ...e, status: ev.status === "concluido" ? "confirmado" : "concluido" } : e)));
    const r = await api(`/api/events/${ev.id}/complete`, { method: "POST", body: JSON.stringify({ done: ev.status !== "concluido" }) });
    if (!r.ok) toast.error("Não foi possível concluir", { description: r.error });
    await load();
  }

  async function duplicate(ev: CalendarEvent, allowConflicts = false) {
    const r = await api(`/api/events/${ev.id}/duplicate`, { method: "POST", body: JSON.stringify({ allowConflicts }) });
    if (r.ok) toast.success("Duplicado para a próxima semana");
    else if (r.status === 409)
      toast.warning("A cópia conflita com outro compromisso", { action: { label: "Duplicar mesmo assim", onClick: () => void duplicate(ev, true) } });
    else toast.error("Não foi possível duplicar", { description: r.error });
    await load();
  }

  const today = todayYmd(tz);
  const isCurrent = view === "mes" ? anchor.slice(0, 7) === today.slice(0, 7) : days.includes(today) && (view !== "lista" || anchor === today);
  const filtered = activeFilterCount(filters) > 0;
  const rowActions = {
    timezone: tz,
    categories: catMap,
    colorOf,
    onOpen: (ev: CalendarEvent) => void openEdit(ev),
    onComplete: (ev: CalendarEvent) => void complete(ev),
    onDuplicate: (ev: CalendarEvent) => void duplicate(ev),
    onDelete: (ev: CalendarEvent) => void remove(ev),
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-3 pb-24">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Agenda</h1>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-1">
          {status?.google.connected && (
            <Button variant="outline" size="sm" onClick={() => void syncNow()} disabled={syncing} aria-label="Sincronizar com o Google">
              {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
              <span className="hidden sm:inline">Sincronizar</span>
              {status.pending > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">{status.pending}</span>}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Sair" onClick={() => void signOut()}>
            <LogOut aria-hidden />
          </Button>
        </div>
      </header>

      {status && !status.google.connected && (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          {status.google.status === "revoked" ? "O acesso ao Google expirou ou foi revogado. " : "Google Calendar não conectado: seus compromissos ficam só no app. "}
          <Link href="/configuracoes" className="font-medium text-foreground underline underline-offset-4">
            {status.google.status === "revoked" ? "Reconectar" : "Conectar em Configurações"}
          </Link>
        </p>
      )}

      <QuickAdd timezone={tz} onDraft={(draft: QuickDraft) => openCreate({ draft })} />

      {/* visões + navegação */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Visão" className="grid w-full grid-cols-4 rounded-lg bg-muted p-0.5 sm:w-auto">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={view === v.id}
              onClick={() => navigate(v.id, v.id === "dia" || days.includes(today) ? today : anchor)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.id === "dia" && anchor !== today && view === "dia" ? "Dia" : v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Anterior" onClick={() => navigate(view, stepAnchor(view, anchor, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Próximo" onClick={() => navigate(view, stepAnchor(view, anchor, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          {!isCurrent && (
            <Button variant="outline" size="sm" onClick={() => navigate(view, view === "mes" ? `${today.slice(0, 7)}-01` : today)}>
              Hoje
            </Button>
          )}
          <h2 className="ml-1 truncate text-sm font-semibold first-letter:uppercase" aria-live="polite">
            {viewTitle(view, anchor, tz)}
          </h2>
          {loading && !loadError && events.length > 0 && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Atualizando" />}
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} categories={categories} />

      {loadError ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm">
          <AlertCircle className="size-6 text-destructive" aria-hidden />
          <p>
            Não foi possível carregar a agenda <span className="text-muted-foreground">({loadError})</span>.
          </p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw aria-hidden /> Tentar de novo
          </Button>
        </div>
      ) : loading && !events.length ? (
        <AgendaSkeleton view={view} />
      ) : (
        <>
          {view === "dia" || view === "semana" ? (
            <TimeGrid
              days={days}
              events={visible}
              timezone={tz}
              colorOf={colorOf}
              onOpen={rowActions.onOpen}
              onCreateAt={(date, time) => openCreate({ date, time })}
              onMove={(ev, start) => void move(ev, start)}
              onPickDay={(d) => navigate("dia", d)}
            />
          ) : view === "mes" ? (
            <MonthView days={days} month={anchor.slice(0, 7)} events={visible} timezone={tz} colorOf={colorOf} onOpen={rowActions.onOpen} onPickDay={(d) => navigate("dia", d)} />
          ) : (
            <ListView days={days} events={visible} {...rowActions} />
          )}

          {!visible.length && (
            <EmptyState
              filtered={filtered && events.length > 0}
              view={view}
              onClear={() => setFilters(EMPTY_FILTERS)}
              onCreate={() => openCreate({ date: view === "dia" ? anchor : undefined })}
            />
          )}
        </>
      )}

      <Button
        size="icon-lg"
        aria-label="Novo compromisso"
        className="fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-lg"
        onClick={() => openCreate({ date: view === "dia" ? anchor : undefined })}
      >
        <Plus className="size-6" aria-hidden />
      </Button>

      <EventForm
        key={form.key}
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        initial={form.initial}
        timezone={tz}
        categories={categories}
        onSubmit={save}
      />
    </main>
  );
}

function EmptyState({ filtered, view, onClear, onCreate }: { filtered: boolean; view: View; onClear: () => void; onCreate: () => void }) {
  const period = view === "dia" ? "neste dia" : view === "semana" ? "nesta semana" : view === "mes" ? "neste mês" : `nos próximos ${LIST_DAYS} dias`;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      <CalendarPlus className="size-6" aria-hidden />
      {filtered ? (
        <>
          <p>Nenhum compromisso {period} com esses filtros.</p>
          <Button variant="outline" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        </>
      ) : (
        <>
          <p>Nada agendado {period}.</p>
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus aria-hidden /> Novo compromisso
          </Button>
        </>
      )}
    </div>
  );
}

function AgendaSkeleton({ view }: { view: View }) {
  return (
    <div className="animate-pulse space-y-2" aria-label="Carregando" role="status">
      {view === "lista" ? (
        Array.from({ length: 5 }, (_, i) => <div key={i} className="h-14 rounded-xl bg-muted" />)
      ) : view === "mes" ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="h-16 rounded-md bg-muted sm:h-24" />
          ))}
        </div>
      ) : (
        <div className="h-[50dvh] rounded-xl bg-muted" />
      )}
    </div>
  );
}
