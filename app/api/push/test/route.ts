import { apiCtx } from "@/lib/api";
import { pushToUser, vapidFrom } from "@/lib/reminders/engine";
import { HttpError, handle } from "@/lib/session";

// POST /api/push/test → notificação de teste em todos os aparelhos do usuário
export const POST = handle(async () => {
  const { db, env, user } = await apiCtx();
  if (!vapidFrom(env)) throw new HttpError(503, "VAPID não configurado no servidor");
  const r = await pushToUser(db, env, user.id, {
    title: "Agenda Inteligente",
    body: "Notificações funcionando neste aparelho ✓",
    tag: "teste",
    url: "/configuracoes",
    priority: 3,
  });
  return Response.json(r);
});
