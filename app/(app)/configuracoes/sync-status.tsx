"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/components/agenda/api";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Status {
  pending: number;
  sync: { incremental: boolean; lastSyncAt: string | null; channelExpiration: string | null } | null;
  recent: { action: string; source: string; createdAt: string; detail: Record<string, unknown> | null }[];
}

/** Painel técnico da sincronização (antes ficava na tela da agenda). */
export function SyncStatus({ timezone }: { timezone: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<Status>("/api/google/status");
      if (r.ok) setStatus(r.data);
      else setError(r.error);
    })();
  }, []);

  if (error) return <p className="text-sm text-destructive">Status indisponível ({error}).</p>;
  if (!status) return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Carregando status" />;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Item label="Pendentes" value={String(status.pending)} warn={status.pending > 0} />
        <Item label="Último sync" value={status.sync?.lastSyncAt ? formatDateTime(status.sync.lastSyncAt, timezone) : "nunca"} />
        <Item label="Aviso automático (watch)" value={status.sync?.channelExpiration ? `até ${formatDateTime(status.sync.channelExpiration, timezone)}` : "inativo (só em HTTPS)"} />
      </dl>
      {status.recent.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-sm text-muted-foreground">Log de sincronização</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {status.recent.map((r, i) => (
              <li key={i} className="break-all">
                {formatDateTime(r.createdAt, timezone)} · {r.source} · {r.action}
                {r.detail ? ` · ${JSON.stringify(r.detail)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Item({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium", warn && "text-amber-600")}>{value}</dd>
    </div>
  );
}
