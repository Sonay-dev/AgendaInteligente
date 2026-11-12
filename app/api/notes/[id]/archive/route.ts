import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { archiveNote } from "@/lib/notes-service";
import { handle } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

const archiveBodySchema = z.object({
  archive: z.boolean().default(true),
});

export const POST = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const body = await readJson(req);
  const { archive } = archiveBodySchema.parse(body);
  const note = await archiveNote(ctx, id, archive);
  return Response.json({ note });
});

