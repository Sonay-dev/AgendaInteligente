import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { deleteNote, getNote, updateNote } from "@/lib/notes-service";
import { handle } from "@/lib/session";
import { notePatchSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const note = await getNote(ctx, id);
  return Response.json({ note });
});

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const body = await readJson(req);
  const patch = notePatchSchema.parse(body);
  const note = await updateNote(ctx, id, patch);
  return Response.json({ note });
});

export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  await deleteNote(ctx, id);
  return new Response(null, { status: 204 });
});

