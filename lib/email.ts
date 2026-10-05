import "server-only";
import type { Env } from "./env";

type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Envia e-mail pela Cloudflare Email Service (binding `EMAIL`). No plano free só chega a endereços
 * verificados em Email Routing — suficiente aqui, já que só os e-mails de ALLOWED_EMAILS têm conta.
 * Em desenvolvimento (APP_URL http://) não envia: mostra a mensagem no terminal.
 */
export async function sendEmail(env: Env, mail: Mail): Promise<void> {
  if (!env.APP_URL.startsWith("https://")) {
    console.info(`[email] para ${mail.to} — ${mail.subject}\n${mail.text}`);
    return;
  }
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: "Agenda Inteligente" },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function resetPasswordEmail(url: string): Omit<Mail, "to"> {
  const href = escapeHtml(url);
  return {
    subject: "Redefinir a senha da Agenda Inteligente",
    text: [
      "Recebemos um pedido para redefinir a senha da sua conta na Agenda Inteligente.",
      "",
      `Para criar uma nova senha, abra o link abaixo (vale por 1 hora):`,
      url,
      "",
      "Se não foi você, ignore este e-mail: sua senha continua a mesma.",
    ].join("\n"),
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.5">
<p>Recebemos um pedido para redefinir a senha da sua conta na <strong>Agenda Inteligente</strong>.</p>
<p><a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#0f172a;color:#fff;text-decoration:none">Criar nova senha</a></p>
<p style="font-size:13px;color:#475569">O link vale por 1 hora. Se o botão não funcionar, copie este endereço:<br>${href}</p>
<p style="font-size:13px;color:#475569">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
</body></html>`,
  };
}
