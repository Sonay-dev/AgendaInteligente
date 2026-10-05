import "server-only";
// Tarefas (etapa 8B). Só local por enquanto: a sincronização com o Google Tasks fica desligada
// (sync_status continua "pending" para enviar tudo quando a Tasks API for ativada).
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "@/db";
import { auditLog, subtasks, tasks } from "@/db/schema";
import { assertCategoryOwned } from "./categories-service";
import type { Ctx } from "./events-service";
import { HttpError } from "./session";
import { statusSideEffects } from "./tasks-logic";
import { fromZoned, nowIso, zoned } from "./time";
import type { TaskCreateInput, TaskPatchInput } from "./validation";

export type TaskRow = typeof tasks.$inferSelect;
export type SubtaskRow = typeof subtasks.$inferSelect;
export type TaskWithSubtasks = TaskRow & { subtasks: SubtaskRow[] };

async function batch(db: Db, stmts: BatchItem<"sqlite">[]) {
  const [first, ...rest] = stmts;
  if (first) await db.batch([first, ...rest]);
}

async function getOwned(ctx: Ctx, id: string): Promise<TaskRow> {
  const [t] = await ctx.db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt)));
  if (!t) throw new HttpError(404, "tarefa não encontrada");
  return t;
}

async function withSubtasks(ctx: Ctx, rows: TaskRow[]): Promise<TaskWithSubtasks[]> {
  if (!rows.length) return [];
  const subs = await ctx.db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.userId, ctx.user.id), inArray(subtasks.taskId, rows.map((r) => r.id))))
    .orderBy(asc(subtasks.position), asc(subtasks.createdAt));
  const by = new Map<string, SubtaskRow[]>();
  for (const s of subs) by.set(s.taskId, [...(by.get(s.taskId) ?? []), s]);
  return rows.map((r) => ({ ...r, subtasks: by.get(r.id) ?? [] }));
}

/** abertas = a fazer + em andamento; aguardando; concluidas = últimos 30 dias. */
export async function listTasks(ctx: Ctx, scope: "abertas" | "aguardando" | "concluidas"): Promise<TaskWithSubtasks[]> {
  const base = and(eq(tasks.userId, ctx.user.id), isNull(tasks.deletedAt));
  const where =
    scope === "abertas"
      ? and(base, inArray(tasks.status, ["a_fazer", "em_andamento"]))
      : scope === "aguardando"
        ? and(base, eq(tasks.status, "aguardando"))
        : and(base, eq(tasks.status, "concluida"), gte(tasks.completedAt, new Date(Date.now() - 30 * 86400000).toISOString()));
  const rows = await ctx.db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(scope === "concluidas" ? desc(tasks.completedAt) : asc(tasks.priority))
    .limit(500);
  return withSubtasks(ctx, rows);
}

export async function getTask(ctx: Ctx, id: string): Promise<TaskWithSubtasks> {
  const [t] = await withSubtasks(ctx, [await getOwned(ctx, id)]);
  return t!;
}

/** Monta os inserts (usado também pela triagem, que grava tarefa + item processado no mesmo lote). */
export async function taskInsertStmts(ctx: Ctx, input: TaskCreateInput, id = crypto.randomUUID()) {
  await assertCategoryOwned(ctx, input.categoryId);
  const now = nowIso();
  const side = statusSideEffects({ status: "a_fazer", waitingSince: null, completedAt: null }, input.status, now);
  const stmts: BatchItem<"sqlite">[] = [
    ctx.db.insert(tasks).values({
      id,
      userId: ctx.user.id,
      title: input.title,
      notes: input.notes ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
      dueAllDay: input.dueAllDay,
      priority: input.priority,
      status: input.status,
      categoryId: input.categoryId ?? null,
      assignee: input.assignee ?? null,
      ...side,
      createdAt: now,
      updatedAt: now,
    }),
    ...(input.subtasks ?? []).map((title, position) => ctx.db.insert(subtasks).values({ userId: ctx.user.id, taskId: id, title, position })),
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "tasks", entityId: id, action: "create", source: "app" }),
  ];
  return { id, stmts };
}

export async function createTask(ctx: Ctx, input: TaskCreateInput): Promise<TaskWithSubtasks> {
  const { id, stmts } = await taskInsertStmts(ctx, input);
  await batch(ctx.db, stmts);
  return getTask(ctx, id);
}

export async function updateTask(ctx: Ctx, id: string, patch: TaskPatchInput): Promise<TaskWithSubtasks> {
  const current = await getOwned(ctx, id);
  if (patch.categoryId !== undefined) await assertCategoryOwned(ctx, patch.categoryId);
  const now = nowIso();
  const side = patch.status ? statusSideEffects(current, patch.status, now) : {};
  await batch(ctx.db, [
    ctx.db
      .update(tasks)
      .set({
        ...patch,
        ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt ? new Date(patch.dueAt).toISOString() : null } : {}),
        ...side,
        syncStatus: "pending",
        updatedAt: now,
      })
      .where(eq(tasks.id, id)),
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "tasks", entityId: id, action: "update", source: "app", detail: { fields: Object.keys(patch) } }),
  ]);
  return getTask(ctx, id);
}

export async function deleteTask(ctx: Ctx, id: string): Promise<void> {
  await getOwned(ctx, id);
  const now = nowIso();
  await batch(ctx.db, [
    ctx.db.update(tasks).set({ deletedAt: now, syncStatus: "pending", updatedAt: now }).where(eq(tasks.id, id)),
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "tasks", entityId: id, action: "delete", source: "app" }),
  ]);
}

// ------------------------------------------------------------------ checklist
export async function addSubtask(ctx: Ctx, taskId: string, title: string): Promise<SubtaskRow> {
  await getOwned(ctx, taskId);
  const [{ next }] = (await ctx.db
    .select({ next: sql<number>`coalesce(max(${subtasks.position}), -1) + 1` })
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId))) as [{ next: number }];
  const [row] = await ctx.db.insert(subtasks).values({ userId: ctx.user.id, taskId, title, position: Number(next) }).returning();
  await touch(ctx, taskId);
  return row!;
}

async function ownedSubtask(ctx: Ctx, taskId: string, subId: string): Promise<SubtaskRow> {
  const [row] = await ctx.db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.id, subId), eq(subtasks.taskId, taskId), eq(subtasks.userId, ctx.user.id)));
  if (!row) throw new HttpError(404, "item não encontrado");
  return row;
}

export async function updateSubtask(ctx: Ctx, taskId: string, subId: string, patch: { title?: string; done?: boolean }): Promise<SubtaskRow> {
  await ownedSubtask(ctx, taskId, subId);
  const [row] = await ctx.db
    .update(subtasks)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(subtasks.id, subId))
    .returning();
  await touch(ctx, taskId);
  return row!;
}

export async function deleteSubtask(ctx: Ctx, taskId: string, subId: string): Promise<void> {
  await ownedSubtask(ctx, taskId, subId);
  await ctx.db.delete(subtasks).where(eq(subtasks.id, subId));
  await touch(ctx, taskId);
}

/** Checklist mudou → a tarefa conta como alterada (para o sync futuro com o Google Tasks). */
async function touch(ctx: Ctx, taskId: string) {
  await ctx.db.update(tasks).set({ updatedAt: nowIso(), syncStatus: "pending" }).where(eq(tasks.id, taskId));
}

/** Atrasadas (mesma regra de isOverdue: dia inteiro só vence quando o dia acaba, no fuso do usuário). */
export async function overdueOpenCount(ctx: Ctx): Promise<number> {
  const now = new Date();
  const startOfToday = fromZoned(zoned(now, ctx.user.timezone).ymd, "00:00", ctx.user.timezone).toISOString();
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, ctx.user.id),
        isNull(tasks.deletedAt),
        ne(tasks.status, "concluida"),
        or(and(eq(tasks.dueAllDay, false), lt(tasks.dueAt, now.toISOString())), and(eq(tasks.dueAllDay, true), lt(tasks.dueAt, startOfToday))),
      ),
    );
  return Number(r?.n ?? 0);
}
