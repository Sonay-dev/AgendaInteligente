import { apiCtx } from "@/lib/api";
import { ensureWatch, pullCalendar, pushPending } from "@/lib/google/calendar-sync";
import { hasGoogleConnection } from "@/lib/google/client";
import { HttpError, handle } from "@/lib/session";

// POST /api/google/sync → envia pendentes, traz mudanças (incremental) e garante o canal de push.
export const POST = handle(async () => {
  const { db, env, user } = await apiCtx();
  const ctx = { db, env, userId: user.id };
  if (!(await hasGoogleConnection(ctx))) throw new HttpError(409, "google_nao_conectado");
  const pushed = await pushPending(ctx, 4);
  const pulled = await pullCalendar(ctx);
  const watch = await ensureWatch(ctx).catch(() => "falhou" as const);
  return Response.json({ pushed, pulled, watch });
});
