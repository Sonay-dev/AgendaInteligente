import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { duplicateEvent } from "@/lib/events-service";
import { handle } from "@/lib/session";
import { duplicateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/events/:id/duplicate  { startAt?: ISO (padrão: +7 dias), allowConflicts?: boolean }
export const POST = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const opts = duplicateSchema.parse(await readJson(req));
  return Response.json(await duplicateEvent(ctx, id, opts), { status: 201 });
});
