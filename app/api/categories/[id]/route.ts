import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { deleteCategory, updateCategory } from "@/lib/categories-service";
import { handle } from "@/lib/session";
import { categorySchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const input = categorySchema.partial().parse(await readJson(req));
  return Response.json({ category: await updateCategory(ctx, id, input) });
});

export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  await deleteCategory(ctx, z.uuid().parse((await params).id));
  return new Response(null, { status: 204 });
});
