import { apiCtx, readJson } from "@/lib/api";
import { createCategory, listCategories } from "@/lib/categories-service";
import { handle } from "@/lib/session";
import { categorySchema } from "@/lib/validation";

// GET /api/categories → { categories } (cria as padrão no primeiro acesso)
export const GET = handle(async () => {
  const ctx = await apiCtx();
  return Response.json({ categories: await listCategories(ctx) });
});

// POST /api/categories { name, color } → 201 { category } | 409 nome repetido
export const POST = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const input = categorySchema.parse(await readJson(req));
  return Response.json({ category: await createCategory(ctx, input) }, { status: 201 });
});
