import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { getConnection } from "@/lib/google/oauth";
import { getCurrentUser } from "@/lib/session";
import { CategoriesManager } from "./categories-manager";
import { GoogleIntegration } from "./google-integration";

const GOOGLE_ERRORS: Record<string, string> = {
  cancelado: "Você cancelou a conexão no Google.",
  state_invalido: "A conexão expirou ou veio de outra sessão. Tente de novo.",
  permissoes_incompletas: "Marque as permissões de Agenda e Tarefas na tela do Google para a sincronização funcionar.",
  sem_refresh_token: "O Google não devolveu acesso offline. Remova o app em myaccount.google.com/permissions e conecte de novo.",
  google_recusou: "O Google recusou a conexão.",
};

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/configuracoes">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const conn = await getConnection(await getDb(), user.id);
  const sp = await searchParams;
  const errorCode = typeof sp.google_erro === "string" ? sp.google_erro : null;
  const flash = sp.google === "conectado"
    ? { kind: "ok" as const, text: "Google conectado. A primeira sincronização já começou." }
    : errorCode
      ? { kind: "erro" as const, text: GOOGLE_ERRORS[errorCode] ?? `Não foi possível conectar (${errorCode}).` }
      : null;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <header className="space-y-1">
        <Link href="/agenda" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Agenda
        </Link>
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </header>
      <GoogleIntegration
        flash={flash}
        connection={conn ? { status: conn.status, email: conn.googleEmail, connectedAt: conn.connectedAt } : null}
        timezone={user.timezone}
      />
      <CategoriesManager />
    </main>
  );
}
