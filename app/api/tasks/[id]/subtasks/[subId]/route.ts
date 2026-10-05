import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { deleteSubtask, updateSubtask } from "@/lib/tasks-service";
import { handle } from "@/lib/session";
import { subtaskPatchSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string; subId: string }> };

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const { id, subId } = await params;
  const patch = subtaskPatchSchema.parse(await readJson(req));
  return Response.json({ subtask: await updateSubtask(ctx, z.uuid().parse(id), z.uuid().parse(subId), patch) });
});

export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const { id, subId } = await params;
  await deleteSubtask(ctx, z.uuid().parse(id), z.uuid().parse(subId));
  return new Response(null, { status: 204 });
});
