import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { editInbox, triageInbox } from "@/lib/inbox-service";
import { handle } from "@/lib/session";
import { inboxPatchSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/inbox/:id { rawText } → corrige o texto capturado
export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const { rawText } = inboxPatchSchema.parse(await readJson(req));
  return Response.json({ item: await editInbox(ctx, id, rawText) });
});

// DELETE /api/inbox/:id → descarta (fica registrado como processado/descartado)
export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  await triageInbox(ctx, z.uuid().parse((await params).id), { as: "descartado" });
  return new Response(null, { status: 204 });
});
