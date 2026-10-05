import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { deleteEvent, getEvent, updateEvent } from "@/lib/events-service";
import { handle } from "@/lib/session";
import { eventPatchSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };
const idSchema = z.uuid();

export const GET = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = idSchema.parse((await params).id);
  return Response.json({ event: await getEvent(ctx, id) });
});

// PATCH: editar, mover (startAt/endAt), concluir (status) …
export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = idSchema.parse((await params).id);
  const patch = eventPatchSchema.parse(await readJson(req));
  return Response.json(await updateEvent(ctx, id, patch));
});

// DELETE: soft delete (deleted_at) + exclusão no Google em segundo plano
export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  await deleteEvent(ctx, idSchema.parse((await params).id));
  return new Response(null, { status: 204 });
});
