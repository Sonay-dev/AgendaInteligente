import { z } from "zod";
import { apiCtx, readJson } from "@/lib/api";
import { addSubtask } from "@/lib/tasks-service";
import { handle } from "@/lib/session";
import { subtaskCreateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/tasks/:id/subtasks { title } → 201 { subtask }
export const POST = handle(async (req: Request, { params }: Params) => {
  const ctx = await apiCtx();
  const id = z.uuid().parse((await params).id);
  const { title } = subtaskCreateSchema.parse(await readJson(req));
  return Response.json({ subtask: await addSubtask(ctx, id, title) }, { status: 201 });
});
