"use client";
import { CheckCircle2, Circle, Copy, MapPin, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { zoned } from "@/lib/time";
import type { CalendarEvent, Category } from "./api";
import { PRIORITY_DOT, dayHeading, eventsOnDay } from "./view-utils";

export interface RowActions {
  timezone: string;
  categories: Map<string, Category>;
  colorOf: (ev: CalendarEvent) => string;
  onOpen: (ev: CalendarEvent) => void;
  onComplete: (ev: CalendarEvent) => void;
  onDuplicate: (ev: CalendarEvent) => void;
  onDelete: (ev: CalendarEvent) => void;
}

export function EventRow({ ev, timezone, categories, colorOf, onOpen, onComplete, onDuplicate, onDelete }: RowActions & { ev: CalendarEvent }) {
  const done = ev.status === "concluido";
  const cat = ev.categoryId ? categories.get(ev.categoryId) : undefined;
  const s = zoned(new Date(ev.occurrenceStart), timezone);
  const e = zoned(new Date(ev.occurrenceEnd), timezone);
  return (
    <li className="group flex items-center gap-1.5 px-1.5 py-1.5">
      <Button variant="ghost" size="icon-sm" aria-label={done ? "Marcar como pendente" : "Concluir"} onClick={() => onComplete(ev)}>
        {done ? <CheckCircle2 className="text-emerald-600" aria-hidden /> : <Circle className="text-muted-foreground" aria-hidden />}
      </Button>
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: colorOf(ev) }} aria-hidden />
      <button type="button" className="min-w-0 flex-1 py-0.5 text-left" onClick={() => onOpen(ev)}>
        <span className={cn("flex items-center gap-1.5 text-sm font-medium", done && "text-muted-foreground line-through")}>
          {ev.priority < 3 && <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[ev.priority])} aria-label={`prioridade P${ev.priority}`} />}
          <span className="truncate">{ev.title}</span>
          {ev.rrule && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="recorrente" />}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{ev.allDay ? "dia inteiro" : `${s.hm}–${e.hm}`}</span>
          {cat && <span>{cat.name}</span>}
          {ev.location && (
            <span className="inline-flex min-w-0 items-center gap-0.5">
              <MapPin className="size-3" aria-hidden />
              <span className="truncate">{ev.location}</span>
            </span>
          )}
          {ev.syncStatus === "error" && <span className="text-amber-600">erro de sync</span>}
        </span>
      </button>
      <div className="flex sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" aria-label="Duplicar para a próxima semana" onClick={() => onDuplicate(ev)}>
          <Copy aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Excluir" onClick={() => onDelete(ev)}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function ListView({ days, events, ...actions }: RowActions & { days: string[]; events: CalendarEvent[] }) {
  const groups = days.map((d) => ({ d, items: eventsOnDay(events, d, actions.timezone) })).filter((g) => g.items.length);
  return (
    <div className="space-y-4">
      {groups.map(({ d, items }) => (
        <section key={d} aria-label={dayHeading(d, actions.timezone)}>
          <h3 className="sticky top-0 z-10 bg-background/95 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
            {dayHeading(d, actions.timezone)}
          </h3>
          <ul className="divide-y rounded-xl border">
            {items.map((ev) => (
              <EventRow key={ev.id + ev.occurrenceStart} ev={ev} {...actions} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
