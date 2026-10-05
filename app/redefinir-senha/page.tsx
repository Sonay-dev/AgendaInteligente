import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova senha", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && !error;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Nova senha</h1>
          <p className="text-sm text-muted-foreground">
            {valid ? "Escolha uma nova senha para entrar na Agenda." : "Este link é inválido ou já expirou."}
          </p>
        </div>
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Peça um novo link em{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
              Entrar → Esqueci a senha
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
