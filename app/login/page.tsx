import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/agenda");
  const { senha, modo } = await searchParams;
  const notice = senha === "redefinida" ? "Senha alterada. Entre com a nova senha." : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Agenda Inteligente</h1>
          <p className="text-sm text-muted-foreground">Entre com seu e-mail e senha.</p>
        </div>
        <LoginForm notice={notice} initialMode={modo === "criar" ? "criar" : "entrar"} />
        <p className="text-center text-xs text-muted-foreground">
          A conexão com o Google Calendar é opcional e fica em Configurações, depois de entrar.
        </p>
        <p className="flex justify-center gap-4 text-xs text-muted-foreground">
          <Link href="/privacidade" className="underline-offset-4 hover:underline">
            Privacidade
          </Link>
          <Link href="/termos" className="underline-offset-4 hover:underline">
            Termos de uso
          </Link>
        </p>
      </div>
    </main>
  );
}
