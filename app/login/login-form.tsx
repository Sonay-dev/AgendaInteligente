"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre com a sua senha.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Entre com a sua senha.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 10 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 128 caracteres.",
  INVALID_EMAIL: "E-mail inválido.",
  email_nao_autorizado: "Este e-mail não está autorizado a usar o app.",
  envio_falhou: "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.",
};

function errorMessage(err: { code?: string; message?: string; status?: number }): string {
  if (err.status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  return MESSAGES[err.code ?? ""] ?? MESSAGES[err.message ?? ""] ?? "Não foi possível entrar. Tente de novo.";
}

type Mode = "entrar" | "criar" | "esqueci";

export function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const creating = mode === "criar";
  const forgot = mode === "esqueci";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (forgot) {
      setLoading(true);
      setError(null);
      const { error: err } = await authClient.requestPasswordReset({ email, redirectTo: "/redefinir-senha" });
      setLoading(false);
      if (err) {
        setError(errorMessage(err));
        return;
      }
      // mesma resposta exista ou não a conta (não revela quais e-mails estão cadastrados)
      setInfo("Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha. O link vale por 1 hora.");
      return;
    }
    const password = String(form.get("password") ?? "");
    if (creating && password !== form.get("confirm")) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error: err } = creating
      ? await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "").trim() || email.split("@")[0]! })
      : await authClient.signIn.email({ email, password, rememberMe: true });
    if (err) {
      setError(errorMessage(err));
      setLoading(false);
      return;
    }
    router.replace("/agenda");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-left">
      {creating && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" autoComplete="name" className="h-10" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </div>
      {!forgot && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Senha</Label>
            {!creating && (
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => switchMode("esqueci")}
              >
                Esqueci a senha
              </button>
            )}
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={creating ? "new-password" : "current-password"}
            required
            minLength={creating ? 10 : undefined}
            maxLength={128}
            className="h-10"
          />
        </div>
      )}
      {creating && (
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={10} maxLength={128} className="h-10" />
        </div>
      )}
      {forgot && (
        <p className="text-sm text-muted-foreground">Informe o e-mail da conta. Enviaremos um link para você criar uma nova senha.</p>
      )}
      {info && (
        <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm">
          {info}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {forgot ? "Enviar link" : creating ? "Criar conta" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {forgot ? "Lembrou a senha?" : creating ? "Já tem conta?" : "Primeiro acesso?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-4"
          onClick={() => switchMode(mode === "entrar" ? "criar" : "entrar")}
        >
          {mode === "entrar" ? "Criar conta" : "Entrar"}
        </button>
      </p>
    </form>
  );
}
