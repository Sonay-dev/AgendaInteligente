import { getDb } from "@/db";
import { readJson } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { handleNotificationAction } from "@/lib/reminders/actions";
import { handle } from "@/lib/session";
import { notificationActionSchema } from "@/lib/validation";

// POST /api/notifications/action { token, action: "concluir" | "adiar" }
// Chamado pelo service worker; autenticado pelo token assinado da notificação (não pela sessão).
export const POST = handle(async (req: Request) => {
  const { token, action } = notificationActionSchema.parse(await readJson(req));
  const [db, env] = await Promise.all([getDb(), getEnv()]);
  return Response.json(await handleNotificationAction(db, env, token, action));
});
