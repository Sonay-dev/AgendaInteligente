"use client";
// Etapa 9: estado de conexão + fila de escritas offline (captura e conclusão de tarefas).
// Envia a fila ao abrir o app, quando a conexão volta e a cada 30 s enquanto houver pendências.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { refreshCounts } from "@/components/app-nav";
import { idbStore } from "@/lib/offline/idb-store";
import { enqueue as enqueueOp, flush, type QueueEntry, type QueuedOp } from "@/lib/offline/queue";

/** Disparado depois que a fila foi enviada (telas recarregam seus dados). */
export const QUEUE_FLUSHED_EVENT = "agenda:queue-flushed";

interface OfflineState {
  online: boolean;
  pending: QueueEntry[];
  enqueue: (op: QueuedOp) => Promise<QueueEntry>;
  flushNow: () => Promise<void>;
}

const Ctx = createContext<OfflineState | null>(null);

export function useOffline(): OfflineState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOffline fora do OfflineProvider");
  return v;
}

async function send(url: string, init: RequestInit): Promise<number> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  return res.status;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  // começa "online" (igual ao servidor); o navegador corrige no primeiro efeito
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueueEntry[]>([]);
  const [flushing, setFlushing] = useState(false);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    try {
      setPending(await idbStore.all());
    } catch {
      setPending([]);
    }
  }, []);

  const flushNow = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setFlushing(true);
    try {
      if (!(await idbStore.all()).length) return;
      const r = await flush(idbStore, send);
      if (r.sent) {
        toast.success(`${r.sent} alteração(ões) feitas offline foram enviadas`);
        window.dispatchEvent(new Event(QUEUE_FLUSHED_EVENT));
        refreshCounts();
      }
      for (const d of r.dropped) {
        toast.error("Uma alteração offline foi recusada", {
          description: d.kind === "inbox.capture" ? `Captura: ${d.payload.rawText}` : "A tarefa não existe mais ou mudou em outro aparelho.",
        });
      }
      setOnline(!r.offline && navigator.onLine);
    } catch {
      // IndexedDB indisponível (aba privada etc.): nada a enviar
    } finally {
      busy.current = false;
      setFlushing(false);
      await reload();
    }
  }, [reload]);

  const enqueue = useCallback(
    async (op: QueuedOp) => {
      const entry = await enqueueOp(idbStore, op);
      setOnline(false); // só se enfileira quando o servidor não respondeu (sem rede ou fora do ar)
      await reload();
      return entry;
    },
    [reload],
  );

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flushNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void (async () => {
      setOnline(navigator.onLine);
      await reload();
      await flushNow();
    })();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flushNow, reload]);

  // enquanto houver pendências, tenta de novo a cada 30 s (o evento "online" nem sempre dispara)
  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(() => void flushNow(), 30_000);
    return () => clearInterval(t);
  }, [pending.length, flushNow]);

  return (
    <Ctx.Provider value={{ online, pending, enqueue, flushNow }}>
      {(!online || pending.length > 0) && (
        <div role="status" className="sticky top-0 z-40 flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {!online ? "Sem conexão — mostrando os dados salvos neste aparelho." : "Enviando o que foi feito sem conexão…"}
            {pending.length > 0 && ` ${pending.length} alteração(ões) aguardando envio.`}
          </span>
          {pending.length > 0 && (
            <button type="button" onClick={() => void flushNow()} disabled={flushing} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              {flushing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />}
              Enviar agora
            </button>
          )}
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
