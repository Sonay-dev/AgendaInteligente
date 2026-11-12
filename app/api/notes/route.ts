import { apiCtx, readJson } from "@/lib/api";
import { createNote, listNotes } from "@/lib/notes-service";
import { handle } from "@/lib/session";
import { noteCreateSchema, noteListQuerySchema } from "@/lib/validation";

// GET /api/notes?archived=true|false|all → { notes }
export const GET = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const url = new URL(req.url);
  const { archived } = noteListQuerySchema.parse({
    archived: url.searchParams.get("archived") ?? undefined,
  });

  const notes = await listNotes(ctx, { archived });
  return Response.json({ notes });
});

// POST /api/notes → 201 { note }
export const POST = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const body = await readJson(req);
  const input = noteCreateSchema.parse(body);
  const note = await createNote(ctx, input);
  return Response.json({ note }, { status: 201 });
});

