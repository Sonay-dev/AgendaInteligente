"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/components/agenda/api";
import { b64ToBytes } from "@/lib/crypto";

type Support = "ok" | "ios-instalar" | "sem-suporte";

function detectSupport(): Support {
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (hasPush) return "ok";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return ios ? "ios-instalar" : "sem-suporte";
}
const noop = () => () => {};

export function NotificationsSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  // "carregando" no servidor; detecção real no navegador (sem divergência de hidratação)
  const support = useSyncExternalStore(noop, detectSupport, () => null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);

  const refresh = useCallback(async () => {
    const r = await api<{ devices: unknown[] }>("/api/push/devices");
    if (r.ok) setDevices(r.data.devices.length);
    if (detectSupport() !== "ok") return;
    setPermission(Notification.permission);
    const reg = await navigator.serviceWorker.getRegistration("/");
    setSubscribed(!!(await reg?.pushManager.getSubscription()));
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  async function enable() {
    if (!vapidPublicKey) return void toast.error("O servidor ainda não tem as chaves VAPID configuradas.");
    setBusy("on");
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Permissão negada", { description: "Libere as notificações deste site nas configurações do navegador." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey) }));
      const r = await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) {
        await sub.unsubscribe();
        toast.error("Não foi possível ativar", { description: r.error });
        return;
      }
      toast.success("Notificações ativadas neste aparelho");
    } catch (e) {
      toast.error("Não foi possível ativar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function disable() {
    setBusy("off");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      toast.success("Notificações desativadas neste aparelho");
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function test() {
    setBusy("test");
    const r = await api<{ sent: number; devices: number; errors: number }>("/api/push/test", { method: "POST" });
    setBusy(null);
    if (!r.ok) return void toast.error("Falha no teste", { description: r.error });
    if (!r.data.sent) toast.error("Nenhum aparelho recebeu", { description: r.data.devices ? "O serviço de push recusou o envio." : "Ative em algum aparelho primeiro." });
    else toast.success(`Enviado para ${r.data.sent} aparelho(s)`, { description: "A notificação deve aparecer em alguns segundos." });
    await refresh();
  }

  return (
    <section aria-labelledby="notif-title" className="space-y-4 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <h2 id="notif-title" className="font-medium">
            Notificações
          </h2>
          <p className="text-sm text-muted-foreground">
            Lembretes de compromissos e tarefas com os botões <strong>Concluir</strong> e <strong>Adiar 15 min</strong>.
            {devices ? ` ${devices} aparelho(s) ativo(s).` : ""}
          </p>
        </div>
      </div>

      {support === null ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Verificando" />
      ) : support === "ios-instalar" ? (
        <p className="rounded-lg bg-muted p-3 text-sm">
          No iPhone/iPad as notificações só funcionam com o app instalado: toque em <strong>Compartilhar</strong> →{" "}
          <strong>Adicionar à Tela de Início</strong>, abra pelo ícone e volte aqui.
        </p>
      ) : support === "sem-suporte" ? (
        <p className="rounded-lg bg-muted p-3 text-sm">Este navegador não suporta notificações push.</p>
      ) : permission === "denied" ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          As notificações deste site estão bloqueadas no navegador. Libere em Configurações do site → Notificações e recarregue.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {subscribed ? (
            <>
              <Button onClick={() => void test()} disabled={!!busy}>
                {busy === "test" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Enviar teste
              </Button>
              <Button variant="outline" onClick={() => void disable()} disabled={!!busy}>
                {busy === "off" ? <Loader2 className="animate-spin" aria-hidden /> : <BellOff aria-hidden />} Desativar neste aparelho
              </Button>
            </>
          ) : (
            <Button onClick={() => void enable()} disabled={!!busy || subscribed === null}>
              {busy === "on" ? <Loader2 className="animate-spin" aria-hidden /> : <BellRing aria-hidden />} Ativar neste aparelho
            </Button>
          )}
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Quando os lembretes chegam</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium"></th>
                <th className="py-1 pr-2 font-medium">Compromissos</th>
                <th className="py-1 font-medium">Tarefas com prazo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-1.5 pr-2 font-medium text-red-600">P1</td>
                <td className="py-1.5 pr-2">1 dia, 1 h e 10 min antes</td>
                <td className="py-1.5">véspera, 1 h e 10 min antes, na hora e todo dia às 08:00 se atrasar (até 7 dias)</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2 font-medium text-amber-600">P2</td>
                <td className="py-1.5 pr-2">1 h e 10 min antes</td>
                <td className="py-1.5">1 h e 10 min antes, na hora e uma cobrança no dia seguinte</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2 font-medium text-sky-600">P3</td>
                <td className="py-1.5 pr-2">10 min antes</td>
                <td className="py-1.5">10 min antes</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Dia inteiro: aviso às 08:00 do dia (P1 também na véspera às 18:00). Os lembretes de cada compromisso podem ser
            trocados no formulário. P1 fica na tela até você tocar. Precisão de até ~5 min (o servidor verifica a cada 5 min).
          </p>
        </div>
      </details>
    </section>
  );
}
