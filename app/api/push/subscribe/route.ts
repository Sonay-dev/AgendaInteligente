import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { apiCtx, readJson } from "@/lib/api";
import { handle } from "@/lib/session";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validation";

// POST /api/push/subscribe { endpoint, keys: { p256dh, auth } } → registra este aparelho
export const POST = handle(async (req: Request) => {
  const { db, user } = await apiCtx();
  const { endpoint, keys } = pushSubscribeSchema.parse(await readJson(req));
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent } });
  return Response.json({ ok: true }, { status: 201 });
});

// DELETE /api/push/subscribe { endpoint } → remove este aparelho
export const DELETE = handle(async (req: Request) => {
  const { db, user } = await apiCtx();
  const { endpoint } = pushUnsubscribeSchema.parse(await readJson(req));
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
  return new Response(null, { status: 204 });
});
