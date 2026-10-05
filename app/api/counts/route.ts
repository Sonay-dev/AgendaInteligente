import { apiCtx } from "@/lib/api";
import { inboxCount } from "@/lib/inbox-service";
import { overdueOpenCount } from "@/lib/tasks-service";
import { handle } from "@/lib/session";

// GET /api/counts → contadores da navegação { inbox, overdue }
export const GET = handle(async () => {
  const ctx = await apiCtx();
  const [inbox, overdue] = await Promise.all([inboxCount(ctx), overdueOpenCount(ctx)]);
  return Response.json({ inbox, overdue });
});
