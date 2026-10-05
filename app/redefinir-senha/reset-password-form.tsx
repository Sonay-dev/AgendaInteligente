"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";

const MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "Este link é inválido ou já expirou. Peça um novo na tela de entrar.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 10 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 128 caracteres.",
};

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword !== form.get("confirm")) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword, token });
    if (err) {
      setError(
        err.status === 429
          ? "Muitas tentativas. Aguarde um pouco e tente de novo."
          : (MESSAGES[err.code ?? ""] ?? "Não foi possível salvar a nova senha. Tente de novo."),
      );
      setLoading(false);
      return;
    }
    router.replace("/login?senha=redefinida");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-left">
      <div className="space-y-1.5">
        <Label htmlFor="password">Nova senha</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={10} maxLength={128} className="h-10" />
        <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirmar nova senha</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={10} maxLength={128} className="h-10" />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar nova senha
      </Button>
    </form>
  );
}
