"use client";
import { cn } from "@/lib/utils";
import { zoned } from "@/lib/time";
import type { CalendarEvent } from "./api";
import { eventsOnDay, todayYmd } from "./view-utils";

const DOW = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MAX_CHIPS = 3;

interface Props {
  days: string[]; // 42 dias, começando na segunda
  month: string; // YYYY-MM
  events: CalendarEvent[];
  timezone: string;
  colorOf: (ev: CalendarEvent) => string;
  onOpen: (ev: CalendarEvent) => void;
  onPickDay: (date: string) => void;
}

export function MonthView({ days, month, events, timezone, colorOf, onOpen, onPickDay }: Props) {
  const today = todayYmd(timezone);
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-[11px] text-muted-foreground">
        {DOW.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const dayEvents = eventsOnDay(events, d, timezone);
          const inMonth = d.startsWith(month);
          const extra = dayEvents.length - MAX_CHIPS;
          return (
            <div
              key={d}
              className={cn(
                "flex min-h-16 min-w-0 flex-col gap-0.5 p-1 sm:min-h-24",
                i < 35 && "border-b",
                i % 7 !== 0 && "border-l",
                !inMonth && "bg-muted/40 text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className={cn(
                  "grid size-6 place-items-center self-start rounded-full text-xs font-medium hover:bg-muted",
                  d === today && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                aria-label={`Abrir o dia ${d}${dayEvents.length ? `, ${dayEvents.length} compromisso(s)` : ""}`}
              >
                {Number(d.slice(8))}
              </button>
              {/* celular: só bolinhas (toque no dia abre a visão Hoje daquele dia); telas maiores: títulos */}
              <button type="button" onClick={() => onPickDay(d)} className="flex flex-wrap gap-0.5 sm:hidden" tabIndex={-1} aria-hidden>
                {dayEvents.slice(0, 6).map((e) => (
                  <span key={e.id + e.occurrenceStart} className="size-1.5 rounded-full" style={{ backgroundColor: colorOf(e) }} />
                ))}
              </button>
              <div className="hidden space-y-0.5 sm:block">
                {dayEvents.slice(0, MAX_CHIPS).map((e) => (
                  <button
                    key={e.id + e.occurrenceStart}
                    type="button"
                    onClick={() => onOpen(e)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-1 rounded px-1 text-left text-[11px] hover:bg-muted",
                      e.status === "concluido" && "line-through opacity-55",
                    )}
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(e) }} />
                    {!e.allDay && <span className="shrink-0 text-muted-foreground tabular-nums">{zoned(new Date(e.occurrenceStart), timezone).hm}</span>}
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {extra > 0 && (
                  <button type="button" onClick={() => onPickDay(d)} className="px-1 text-[11px] text-muted-foreground hover:text-foreground">
                    +{extra} mais
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
