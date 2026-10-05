import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { deleteTask, getTask, updateTask } from "@/lib/tasks-service";
import { handle } from "@/lib/session";
import { taskPatchSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  return Response.json({ task: await getTask(ctx, z.uuid().parse((await params).id)) });
});

// PATCH: editar, mudar status (concluir/aguardando), registrar contato (lastContactAt)…
export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  return Response.json({ task: await updateTask(ctx, id, taskPatchSchema.parse(await readJson(req))) });
});

export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  await deleteTask(ctx, z.uuid().parse((await params).id));
  return new Response(null, { status: 204 });
});
