import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { updateEvent } from "@/lib/events-service";
import { handle } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };
const bodySchema = z.object({ done: z.boolean().default(true) });

// POST /api/events/:id/complete  { done?: boolean }
export const POST = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const { done } = bodySchema.parse(await readJson(req));
  return Response.json(await updateEvent(ctx, id, { status: done ? "concluido" : "confirmado" }));
});
