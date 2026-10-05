"use client";
// Grade de horários para as visões Hoje (1 dia) e Semana (7 dias). Toque num horário vazio para criar,
// arraste um compromisso (não recorrente) para mover.
import { useEffect, useRef } from "react";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromZoned, zoned } from "@/lib/time";
import type { CalendarEvent } from "./api";
import { NEUTRAL_COLOR, PRIORITY_DOT, eventsOnDay, todayYmd } from "./view-utils";

const PX_PER_MIN = 0.9;
const SNAP = 15;
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

interface Props {
  days: string[];
  events: CalendarEvent[];
  timezone: string;
  colorOf: (ev: CalendarEvent) => string;
  onOpen: (ev: CalendarEvent) => void;
  onCreateAt: (date: string, time: string | null) => void;
  onMove: (ev: CalendarEvent, newStart: Date) => void;
  onPickDay?: (date: string) => void;
}

/** Posiciona eventos sobrepostos lado a lado (colunas simples). */
function layout(dayEvents: CalendarEvent[]) {
  const items = dayEvents
    .map((ev) => ({ ev, s: new Date(ev.occurrenceStart).getTime(), e: new Date(ev.occurrenceEnd).getTime(), col: 0, cols: 1 }))
    .sort((a, b) => a.s - b.s || b.e - a.e);
  let group: typeof items = [];
  let groupEnd = 0;
  const flush = () => {
    const n = Math.max(...group.map((g) => g.col)) + 1;
    for (const g of group) g.cols = n;
    group = [];
  };
  for (const it of items) {
    if (group.length && it.s >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.e > it.s).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    it.col = col;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.e);
  }
  if (group.length) flush();
  return items;
}

export function TimeGrid({ days, events, timezone, colorOf, onOpen, onCreateAt, onMove, onPickDay }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = todayYmd(timezone);
  const now = zoned(new Date(), timezone);
  const height = 24 * 60 * PX_PER_MIN;
  const single = days.length === 1;

  useEffect(() => {
    // abre a grade perto da hora atual (ou às 7h)
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, (Math.min(now.h, 18) - 1) * 60 * PX_PER_MIN);
    // só na montagem / troca de dias
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  const minuteFromY = (el: HTMLElement, clientY: number) => {
    const y = clientY - el.getBoundingClientRect().top;
    return Math.max(0, Math.min(24 * 60 - SNAP, Math.floor(y / PX_PER_MIN / SNAP) * SNAP));
  };

  const cols = `48px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className={cn("overflow-x-auto", !single && "[&>*]:min-w-[640px]")}>
        {/* cabeçalho: dias + compromissos de dia inteiro */}
        <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: cols }}>
          <div className="self-end px-1 pb-1 text-right text-[10px] text-muted-foreground">dia todo</div>
          {days.map((d) => {
            const z = zoned(fromZoned(d, "12:00", timezone), timezone);
            const allDay = eventsOnDay(events, d, timezone).filter((e) => e.allDay);
            return (
              <div key={d} className={cn("min-w-0 border-l px-1 py-1.5", d === today && "bg-primary/5")}>
                {!single && (
                  <button
                    type="button"
                    className="mb-1 flex w-full flex-col items-center rounded-md py-0.5 hover:bg-muted"
                    onClick={() => onPickDay?.(d)}
                    aria-label={`Abrir ${d}`}
                  >
                    <span className="text-[11px] text-muted-foreground">{DOW[z.dow]}</span>
                    <span className={cn("grid size-7 place-items-center rounded-full text-sm font-semibold", d === today && "bg-primary text-primary-foreground")}>
                      {z.d}
                    </span>
                  </button>
                )}
                <div className="space-y-0.5">
                  {allDay.map((e) => (
                    <button
                      key={e.id + e.occurrenceStart}
                      type="button"
                      onClick={() => onOpen(e)}
                      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white", e.status === "concluido" && "line-through opacity-60")}
                      style={{ backgroundColor: colorOf(e) }}
                    >
                      {e.title}
                    </button>
                  ))}
                  {single && !allDay.length && (
                    <button type="button" className="w-full rounded px-1.5 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-muted" onClick={() => onCreateAt(d, null)}>
                      + dia inteiro
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* horas */}
        <div ref={scroller} className="max-h-[65dvh] overflow-y-auto overscroll-contain">
          <div className="grid" style={{ gridTemplateColumns: cols }}>
            <div className="relative" style={{ height }}>
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ top: i * 60 * PX_PER_MIN }}>
                  {i === 0 ? "" : `${String(i).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>

            {days.map((d) => {
              const timed = layout(eventsOnDay(events, d, timezone).filter((e) => !e.allDay));
              return (
                <div
                  key={d}
                  role="gridcell"
                  aria-label={`Horários de ${d}`}
                  className={cn("relative cursor-pointer border-l", d === today && "bg-primary/[0.03]")}
                  style={{
                    height,
                    backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                    backgroundSize: `100% ${60 * PX_PER_MIN}px`,
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) onCreateAt(d, hm(minuteFromY(e.currentTarget, e.clientY)));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const data = e.dataTransfer.getData("application/x-agenda-event");
                    const ev = events.find((x) => `${x.id}|${x.occurrenceStart}` === data);
                    if (!ev) return;
                    const offset = Number(e.dataTransfer.getData("application/x-offset-min")) || 0;
                    const minute = minuteFromY(e.currentTarget, e.clientY) - Math.round(offset / SNAP) * SNAP;
                    onMove(ev, fromZoned(d, hm(Math.max(0, minute)), timezone));
                  }}
                >
                  {d === today && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: (now.h * 60 + now.mi) * PX_PER_MIN }} aria-hidden>
                      <div className="absolute -top-1 -left-1 size-2.5 rounded-full bg-red-500" />
                    </div>
                  )}
                  {timed.map(({ ev, col, cols: n }) => {
                    const s = zoned(new Date(ev.occurrenceStart), timezone);
                    const startMin = s.h * 60 + s.mi;
                    const durMin = (new Date(ev.occurrenceEnd).getTime() - new Date(ev.occurrenceStart).getTime()) / 60000;
                    const color = colorOf(ev) || NEUTRAL_COLOR;
                    const short = durMin < 45;
                    return (
                      <button
                        key={ev.id + ev.occurrenceStart}
                        type="button"
                        draggable={!ev.rrule}
                        title={ev.rrule ? `${ev.title} — série recorrente: edite pelo formulário` : `${ev.title} — arraste para mover`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-agenda-event", `${ev.id}|${ev.occurrenceStart}`);
                          const grabY = e.clientY - e.currentTarget.getBoundingClientRect().top;
                          e.dataTransfer.setData("application/x-offset-min", String(Math.round(grabY / PX_PER_MIN)));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onOpen(ev)}
                        className={cn(
                          "absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs transition-shadow hover:shadow-md",
                          ev.status === "concluido" && "opacity-55",
                        )}
                        style={{
                          top: startMin * PX_PER_MIN + 1,
                          height: Math.max(20, durMin * PX_PER_MIN - 2),
                          left: `calc(${(col / n) * 100}% + 2px)`,
                          width: `calc(${100 / n}% - 4px)`,
                          borderLeftColor: color,
                          backgroundColor: `color-mix(in oklab, ${color} 16%, var(--background))`,
                        }}
                      >
                        <span className={cn("flex items-center gap-1 font-medium", ev.status === "concluido" && "line-through")}>
                          {ev.priority < 3 && <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[ev.priority])} aria-label={`P${ev.priority}`} />}
                          <span className="truncate">{ev.title}</span>
                          {ev.rrule && <Repeat className="size-3 shrink-0 opacity-60" aria-label="recorrente" />}
                        </span>
                        {!short && (
                          <span className="block truncate text-muted-foreground">
                            {s.hm}–{zoned(new Date(ev.occurrenceEnd), timezone).hm}
                            {ev.location ? ` · ${ev.location}` : ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
