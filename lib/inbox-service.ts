import "server-only";
// Caixa de entrada (etapa 8A): captura rápida (digitada ou ditada) e triagem item a item.
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLog, inboxItems } from "@/db/schema";
import { createEvent, type Ctx } from "./events-service";
import { HttpError } from "./session";
import { taskInsertStmts } from "./tasks-service";
import type { EventCreateInput, TaskCreateInput } from "./validation";

export type InboxRow = typeof inboxItems.$inferSelect;

export async function listInbox(ctx: Ctx): Promise<InboxRow[]> {
  return ctx.db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, ctx.user.id), eq(inboxItems.processed, false)))
    .orderBy(desc(inboxItems.createdAt))
    .limit(200);
}

export async function inboxCount(ctx: Ctx): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, ctx.user.id), eq(inboxItems.processed, false)));
  return Number(r?.n ?? 0);
}

export async function captureInbox(ctx: Ctx, rawText: string, source: "digitado" | "voz"): Promise<InboxRow> {
  const [row] = await ctx.db.insert(inboxItems).values({ userId: ctx.user.id, rawText, source }).returning();
  return row!;
}

async function getPending(ctx: Ctx, id: string): Promise<InboxRow> {
  const [row] = await ctx.db.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, ctx.user.id)));
  if (!row) throw new HttpError(404, "item não encontrado");
  if (row.processed) throw new HttpError(409, "item já processado");
  return row;
}

export async function editInbox(ctx: Ctx, id: string, rawText: string): Promise<InboxRow> {
  await getPending(ctx, id);
  const [row] = await ctx.db.update(inboxItems).set({ rawText }).where(eq(inboxItems.id, id)).returning();
  return row!;
}

type Triage = { as: "event"; event: EventCreateInput } | { as: "task"; task: TaskCreateInput } | { as: "descartado" };

/**
 * Processa um item. Tarefa e descarte gravam num único lote; compromisso usa o serviço de eventos
 * (conflito de horário → 409, e o item continua na caixa até o usuário decidir).
 */
export async function triageInbox(ctx: Ctx, id: string, t: Triage): Promise<{ as: Triage["as"]; refId: string | null }> {
  await getPending(ctx, id);
  const done = (as: Triage["as"], refId: string | null) => [
    ctx.db.update(inboxItems).set({ processed: true, processedAs: as, processedRefId: refId }).where(eq(inboxItems.id, id)),
    ctx.db.insert(auditLog).values({ userId: ctx.user.id, entity: "inbox", entityId: id, action: `triage_${as}`, source: "app", detail: refId ? { refId } : null }),
  ];

  if (t.as === "task") {
    const { id: taskId, stmts } = await taskInsertStmts(ctx, t.task);
    const [first, ...rest] = [...stmts, ...done("task", taskId)];
    await ctx.db.batch([first!, ...rest]);
    return { as: "task", refId: taskId };
  }
  if (t.as === "event") {
    const { event } = await createEvent(ctx, t.event);
    const [first, ...rest] = done("event", event.id);
    await ctx.db.batch([first!, ...rest]);
    return { as: "event", refId: event.id };
  }
  const [first, ...rest] = done("descartado", null);
  await ctx.db.batch([first!, ...rest]);
  return { as: "descartado", refId: null };
}
