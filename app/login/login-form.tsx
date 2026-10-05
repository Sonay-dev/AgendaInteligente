"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre com a sua senha.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Entre com a sua senha.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 10 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 128 caracteres.",
  INVALID_EMAIL: "E-mail inválido.",
  email_nao_autorizado: "Este e-mail não está autorizado a usar o app.",
};

function errorMessage(err: { code?: string; message?: string; status?: number }): string {
  if (err.status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  return MESSAGES[err.code ?? ""] ?? MESSAGES[err.message ?? ""] ?? "Não foi possível entrar. Tente de novo.";
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creating = mode === "criar";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (creating && password !== form.get("confirm")) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    setError(null);
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
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={creating ? "new-password" : "current-password"}
          required
          minLength={creating ? 10 : undefined}
          maxLength={128}
          className="h-10"
        />
      </div>
      {creating && (
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} className="h-10" />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {creating ? "Criar conta" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {creating ? "Já tem conta?" : "Primeiro acesso?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-4"
          onClick={() => {
            setMode(creating ? "entrar" : "criar");
            setError(null);
          }}
        >
          {creating ? "Entrar" : "Criar conta"}
        </button>
      </p>
    </form>
  );
}
