import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { auditLog, categories } from "@/db/schema";
import type { Ctx } from "./events-service";
import { HttpError } from "./session";
import type { CategoryInput } from "./validation";

export const DEFAULT_CATEGORIES: CategoryInput[] = [
  { name: "Trabalho", color: "#2563eb" },
  { name: "Pessoal", color: "#16a34a" },
  { name: "Saúde", color: "#0d9488" },
  { name: "Família", color: "#9333ea" },
  { name: "Finanças", color: "#ca8a04" },
];

/** Lista as categorias; na primeira vez cria as padrão (uma só vez: se o usuário apagar todas, não voltam). */
export async function listCategories(ctx: Ctx) {
  const rows = await ctx.db.select().from(categories).where(eq(categories.userId, ctx.user.id)).orderBy(asc(categories.name));
  if (rows.length) return rows;
  const [seeded] = await ctx.db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.userId, ctx.user.id), eq(auditLog.entity, "categories"), eq(auditLog.action, "seed")))
    .limit(1);
  if (seeded) return rows;
  await ctx.db.batch([
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "categories", action: "seed", source: "system" }),
    ...DEFAULT_CATEGORIES.map((c) => ctx.db.insert(categories).values({ userId: ctx.user.id, ...c }).onConflictDoNothing()),
  ]);
  return ctx.db.select().from(categories).where(eq(categories.userId, ctx.user.id)).orderBy(asc(categories.name));
}

export async function assertCategoryOwned(ctx: Ctx, id: string | null | undefined) {
  if (!id) return;
  const [row] = await ctx.db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, id), eq(categories.userId, ctx.user.id)));
  if (!row) throw new HttpError(400, "categoria inválida");
}

function duplicateName(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : "";
  return /UNIQUE/i.test(msg);
}

export async function createCategory(ctx: Ctx, input: CategoryInput) {
  try {
    const [row] = await ctx.db.insert(categories).values({ userId: ctx.user.id, ...input }).returning();
    return row!;
  } catch (e) {
    if (duplicateName(e)) throw new HttpError(409, "já existe uma categoria com esse nome");
    throw e;
  }
}

export async function updateCategory(ctx: Ctx, id: string, input: Partial<CategoryInput>) {
  try {
    const [row] = await ctx.db
      .update(categories)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(and(eq(categories.id, id), eq(categories.userId, ctx.user.id)))
      .returning();
    if (!row) throw new HttpError(404, "categoria não encontrada");
    return row;
  } catch (e) {
    if (duplicateName(e)) throw new HttpError(409, "já existe uma categoria com esse nome");
    throw e;
  }
}

/** Os compromissos da categoria ficam sem categoria (FK on delete set null). */
export async function deleteCategory(ctx: Ctx, id: string) {
  const res = await ctx.db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, ctx.user.id))).returning({ id: categories.id });
  if (!res.length) throw new HttpError(404, "categoria não encontrada");
}
