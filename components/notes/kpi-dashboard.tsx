"use client";
import { useState } from "react";
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  TrendingUp,
} from "lucide-react";
import type { KanbanStats } from "@/lib/notes-logic";

interface KpiDashboardProps {
  stats: KanbanStats;
  onOpenArchived: () => void;
}

export function KpiDashboard({ stats, onOpenArchived }: KpiDashboardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-xs backdrop-blur-sm transition-all sm:p-5">
      {/* Cabeçalho do Painel Executivo */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                Painel Executivo de Gestão
              </h2>
              <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary sm:inline-block">
                Controle Operacional
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Métricas quantitativas e distribuição analítica do fluxo de entregas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stats.arquivados > 0 && (
            <button
              type="button"
              onClick={onOpenArchived}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Visualizar notas arquivadas"
            >
              <Archive className="size-3.5" />
              <span>{stats.arquivados} arquivadas</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex size-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? "Expandir métricas" : "Recolher métricas"}
            title={collapsed ? "Expandir métricas" : "Recolher métricas"}
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-4">
          {/* Grid de 4 KPIs */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
            {/* 1. Total Ativas */}
            <div className="rounded-xl border border-border/60 bg-background/60 p-3 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium tracking-wide uppercase">Total Ativas</span>
                <Layers className="size-3.5 text-muted-foreground/70" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {stats.totalActive}
                </span>
                <span className="text-[11px] text-muted-foreground">cards</span>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                {stats.p1Count > 0 ? (
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    {stats.p1Count} com prioridade alta
                  </span>
                ) : (
                  <span>Sem prioridades críticas</span>
                )}
              </div>
            </div>

            {/* 2. Pendentes (Vermelho) */}
            <div className="rounded-xl border border-rose-300/60 bg-rose-50/50 p-3 transition-colors dark:border-rose-900/60 dark:bg-rose-950/20">
              <div className="flex items-center justify-between text-rose-700 dark:text-rose-400">
                <span className="text-[11px] font-medium tracking-wide uppercase">Pendentes</span>
                <div className="size-2 rounded-full bg-rose-500 animate-pulse" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-rose-700 dark:text-rose-300">
                  {stats.pendentes}
                </span>
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {stats.pendentePct}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rose-200/70 dark:bg-rose-900/40">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-500"
                  style={{ width: `${stats.pendentePct}%` }}
                />
              </div>
            </div>

            {/* 3. Em Curso (Amarelo) */}
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-3 transition-colors dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                <span className="text-[11px] font-medium tracking-wide uppercase">Em Curso</span>
                <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-300">
                  {stats.emCurso}
                </span>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  {stats.emCursoPct}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/40">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${stats.emCursoPct}%` }}
                />
              </div>
            </div>

            {/* 4. Realizados (Verde) */}
            <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/50 p-3 transition-colors dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                <span className="text-[11px] font-medium tracking-wide uppercase">Realizados</span>
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                  {stats.realizados}
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {stats.realizadoPct}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/70 dark:bg-emerald-900/40">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${stats.realizadoPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Barra Global de Eficiência / Conclusão */}
          <div className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Taxa de Conclusão Global</span>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {stats.taxaConclusao.toFixed(1)}%
              </span>
            </div>

            <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-emerald-500 transition-all duration-700"
                style={{ width: `${stats.realizadoPct}%` }}
                title={`Realizados: ${stats.realizadoPct}%`}
              />
              <div
                className="bg-amber-400 transition-all duration-700"
                style={{ width: `${stats.emCursoPct}%` }}
                title={`Em Curso: ${stats.emCursoPct}%`}
              />
              <div
                className="bg-rose-400 transition-all duration-700"
                style={{ width: `${stats.pendentePct}%` }}
                title={`Pendentes: ${stats.pendentePct}%`}
              />
            </div>

            {stats.totalChecklistItems > 0 && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Checklists em andamento</span>
                <span className="font-mono">
                  {stats.completedChecklistItems}/{stats.totalChecklistItems} itens (
                  {stats.checklistProgressPct.toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

