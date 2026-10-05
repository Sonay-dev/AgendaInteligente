import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { triageInbox } from "@/lib/inbox-service";
import { handle } from "@/lib/session";
import { triageSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/inbox/:id/triage { as: "event", event } | { as: "task", task } | { as: "descartado" }
// → { as, refId } | 409 conflito de horário (reenvie com event.allowConflicts: true)
export const POST = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  return Response.json(await triageInbox(ctx, id, triageSchema.parse(await readJson(req))));
});
