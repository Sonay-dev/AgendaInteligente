"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/components/agenda/api";
import { formatDateTime } from "@/lib/time";
import { SyncStatus } from "./sync-status";

interface Props {
  flash: { kind: "ok" | "erro"; text: string } | null;
  connection: { status: "active" | "revoked" | "disconnected"; email: string; connectedAt: string } | null;
  timezone: string;
}

export function GoogleIntegration({ flash, connection, timezone }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active = connection?.status === "active";

  async function disconnect() {
    setBusy(true);
    const r = await api<{ disconnected: boolean }>("/api/google/disconnect", { method: "POST" });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Google desconectado. Seus compromissos continuam no app.");
    router.replace("/configuracoes");
    router.refresh();
  }

  return (
    <>
      {flash && (
        <p
          role={flash.kind === "erro" ? "alert" : "status"}
          className={
            flash.kind === "erro"
              ? "rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              : "rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400"
          }
        >
          {flash.text}
        </p>
      )}

      <section aria-labelledby="google-title" className="space-y-4 rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <CalendarCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <h2 id="google-title" className="font-medium">
              Google Calendar e Tarefas
            </h2>
            <p className="text-sm text-muted-foreground">
              {active
                ? `Conectado como ${connection.email} desde ${formatDateTime(connection.connectedAt, timezone)}. Os compromissos sincronizam nos dois sentidos.`
                : connection?.status === "revoked"
                  ? `O acesso de ${connection.email} expirou ou foi revogado no Google. Reconecte para voltar a sincronizar.`
                  : "Opcional. Conecte para enviar seus compromissos ao Google Calendar e trazer o que você criar por lá."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* navegação completa: a rota redireciona para a tela de consentimento do Google */}
          {!active && (
            <Button render={<a href="/api/google/connect" />} nativeButton={false}>
              {connection?.status === "revoked" ? "Reconectar Google" : "Conectar Google"}
            </Button>
          )}
          {active && (
            <Button variant="outline" onClick={() => void disconnect()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Unplug aria-hidden />} Desconectar
            </Button>
          )}
        </div>
        {active && (
          <div className="border-t pt-3">
            <SyncStatus timezone={timezone} />
          </div>
        )}
      </section>
    </>
  );
}
