"use client";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Category } from "./api";
import { EMPTY_FILTERS, PRIORITY_DOT, activeFilterCount, type Filters } from "./view-utils";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      {children}
    </button>
  );
}

export function FilterBar({ filters, onChange, categories }: { filters: Filters; onChange: (f: Filters) => void; categories: Category[] }) {
  const count = activeFilterCount(filters);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Buscar por título, local ou descrição"
          aria-label="Buscar"
          className="h-9 pl-8"
        />
      </div>
      {/* rolagem horizontal no celular */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Filtros">
        {categories.map((c) => (
          <Chip key={c.id} color={c.color} active={filters.categories.includes(c.id)} onClick={() => onChange({ ...filters, categories: toggle(filters.categories, c.id) })}>
            {c.name}
          </Chip>
        ))}
        <Chip active={filters.categories.includes("none")} onClick={() => onChange({ ...filters, categories: toggle(filters.categories, "none") })}>
          Sem categoria
        </Chip>
        <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
        {[1, 2, 3].map((p) => (
          <Chip key={p} active={filters.priorities.includes(p)} onClick={() => onChange({ ...filters, priorities: toggle(filters.priorities, p) })}>
            <span className={cn("size-2 rounded-full", PRIORITY_DOT[p])} aria-hidden />P{p}
          </Chip>
        ))}
        <Chip active={!filters.showDone} onClick={() => onChange({ ...filters, showDone: !filters.showDone })}>
          Ocultar concluídos
        </Chip>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="h-8 shrink-0 rounded-full" onClick={() => onChange(EMPTY_FILTERS)}>
            <X aria-hidden /> Limpar ({count})
          </Button>
        )}
      </div>
    </div>
  );
}
