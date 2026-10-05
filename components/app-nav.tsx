"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, ListChecks, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dispare após mudar tarefas/caixa de entrada para atualizar os contadores da barra. */
export const COUNTS_EVENT = "agenda:counts";
export const refreshCounts = () => window.dispatchEvent(new Event(COUNTS_EVENT));

const ITEMS = [
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks, count: "overdue" as const },
  { href: "/caixa-de-entrada", label: "Caixa", icon: Inbox, count: "inbox" as const },
  { href: "/configuracoes", label: "Ajustes", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ inbox: number; overdue: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/counts");
      if (res.ok) setCounts(await res.json());
    } catch {
      // sem rede: mantém os últimos números
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const onChange = () => void load();
    window.addEventListener(COUNTS_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(COUNTS_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [load, pathname]);

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon, count }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const n = count && counts ? counts[count] : 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={cn("size-5", active && "stroke-[2.25]")} aria-hidden />
                  {n > 0 && (
                    <span
                      className={cn(
                        "absolute -top-1.5 -right-2.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white",
                        count === "overdue" ? "bg-red-600" : "bg-primary",
                      )}
                      aria-label={count === "overdue" ? `${n} atrasadas` : `${n} na caixa`}
                    >
                      {n > 99 ? "99+" : n}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
