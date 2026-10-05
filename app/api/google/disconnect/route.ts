import { apiCtx } from "@/lib/api";
import { disconnect } from "@/lib/google/oauth";
import { handle } from "@/lib/session";

// POST /api/google/disconnect → revoga o acesso e para a sincronização (os eventos locais ficam).
export const POST = handle(async () => {
  const { db, env, user } = await apiCtx();
  return Response.json({ disconnected: await disconnect(db, env, user.id) });
});
