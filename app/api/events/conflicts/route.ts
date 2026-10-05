import { apiCtx, readJson } from "@/lib/api";
import { checkConflicts } from "@/lib/events-service";
import { handle } from "@/lib/session";
import { conflictCheckSchema } from "@/lib/validation";

// POST /api/events/conflicts  → checagem prévia, usada pelo formulário antes de salvar
export const POST = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const input = conflictCheckSchema.parse(await readJson(req));
  return Response.json({ conflicts: await checkConflicts(ctx, input) });
});
