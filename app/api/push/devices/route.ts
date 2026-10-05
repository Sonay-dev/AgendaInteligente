import { desc, eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { apiCtx } from "@/lib/api";
import { handle } from "@/lib/session";

// GET /api/push/devices → aparelhos inscritos (sem as chaves)
export const GET = handle(async () => {
  const { db, user } = await apiCtx();
  const rows = await db
    .select({ endpoint: pushSubscriptions.endpoint, userAgent: pushSubscriptions.userAgent, createdAt: pushSubscriptions.createdAt })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .orderBy(desc(pushSubscriptions.createdAt));
  return Response.json({ devices: rows });
});
