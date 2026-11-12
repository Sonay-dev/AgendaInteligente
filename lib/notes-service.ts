import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { notes, type NoteRow } from "@/db/schema";
import type { Ctx } from "./events-service";
import { HttpError } from "./session";
import { nowIso } from "./time";
import type { NoteCreateInput, NotePatchInput } from "./validation";

let tableChecked = false;

/** Garante que a tabela `notes` existe no SQLite local / D1 sem bloquear se a migration ainda não rodou */
export async function ensureNotesTable(ctx: Ctx) {
  if (tableChecked) return;
  try {
    await ctx.db.run(sql`
      CREATE TABLE IF NOT EXISTS notes (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        title text NOT NULL,
        content text,
        status text DEFAULT 'pendente' NOT NULL,
        priority integer DEFAULT 3 NOT NULL,
        tag text,
        category_id text,
        is_archived integer DEFAULT 0 NOT NULL,
        is_pinned integer DEFAULT 0 NOT NULL,
        checklist text,
        reminder_at text,
        completed_at text,
        archived_at text,
        color text,
        created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );
    `);
    await ctx.db.run(sql`CREATE INDEX IF NOT EXISTS notes_user_status ON notes(user_id, status);`);
    await ctx.db.run(sql`CREATE INDEX IF NOT EXISTS notes_user_archived ON notes(user_id, is_archived);`);
    tableChecked = true;
  } catch {
    // Drizzle mock ou tabela já presente
  }
}

async function getOwned(ctx: Ctx, id: string): Promise<NoteRow> {
  await ensureNotesTable(ctx);
  const [row] = await ctx.db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, ctx.user.id)));
  if (!row) throw new HttpError(404, "nota não encontrada");
  return row;
}

export async function listNotes(
  ctx: Ctx,
  options: { archived?: boolean | "all" } = {},
): Promise<NoteRow[]> {
  await ensureNotesTable(ctx);
  const { archived = false } = options;

  const conditions = [eq(notes.userId, ctx.user.id)];
  if (archived !== "all") {
    conditions.push(eq(notes.isArchived, archived));
  }

  const rows = await ctx.db
    .select()
    .from(notes)
    .where(and(...conditions))
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
    .limit(500);

  return rows;
}

export async function getNote(ctx: Ctx, id: string): Promise<NoteRow> {
  return getOwned(ctx, id);
}

export async function createNote(ctx: Ctx, input: NoteCreateInput): Promise<NoteRow> {
  await ensureNotesTable(ctx);
  const now = nowIso();
  const id = crypto.randomUUID();

  const checklistStr = input.checklist ? JSON.stringify(input.checklist) : null;
  const isRealizado = input.status === "realizado";

  const [row] = await ctx.db
    .insert(notes)
    .values({
      id,
      userId: ctx.user.id,
      title: input.title,
      content: input.content ?? null,
      status: input.status,
      priority: input.priority,
      tag: input.tag ?? null,
      categoryId: input.categoryId ?? null,
      isArchived: input.isArchived,
      isPinned: input.isPinned,
      checklist: checklistStr,
      reminderAt: input.reminderAt ? new Date(input.reminderAt).toISOString() : null,
      completedAt: isRealizado ? now : null,
      archivedAt: input.isArchived ? now : null,
      color: input.color ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row!;
}

export async function updateNote(ctx: Ctx, id: string, patch: NotePatchInput): Promise<NoteRow> {
  const current = await getOwned(ctx, id);
  const now = nowIso();

  const { checklist, reminderAt, ...rest } = patch;
  const values: Partial<typeof notes.$inferInsert> = {
    ...rest,
    updatedAt: now,
  };

  if (checklist !== undefined) {
    values.checklist = checklist ? JSON.stringify(checklist) : null;
  }

  if (reminderAt !== undefined) {
    values.reminderAt = reminderAt ? new Date(reminderAt).toISOString() : null;
  }

  // Efeitos colaterais de status
  if (patch.status) {
    if (patch.status === "realizado" && current.status !== "realizado") {
      values.completedAt = now;
    } else if (patch.status !== "realizado") {
      values.completedAt = null;
    }
  }

  // Efeitos colaterais de arquivamento
  if (patch.isArchived !== undefined) {
    values.archivedAt = patch.isArchived ? now : null;
  }

  const [row] = await ctx.db
    .update(notes)
    .set(values)
    .where(and(eq(notes.id, id), eq(notes.userId, ctx.user.id)))
    .returning();

  return row!;
}

export async function deleteNote(ctx: Ctx, id: string): Promise<void> {
  await getOwned(ctx, id);
  await ctx.db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, ctx.user.id)));
}

export async function archiveNote(ctx: Ctx, id: string, archive = true): Promise<NoteRow> {
  const now = nowIso();
  const [row] = await ctx.db
    .update(notes)
    .set({
      isArchived: archive,
      archivedAt: archive ? now : null,
      updatedAt: now,
    })
    .where(and(eq(notes.id, id), eq(notes.userId, ctx.user.id)))
    .returning();
  return row!;
}

