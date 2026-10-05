import { apiCtx, readJson } from "@/lib/api";
import { createTask, listTasks } from "@/lib/tasks-service";
import { handle } from "@/lib/session";
import { taskCreateSchema, taskListQuerySchema } from "@/lib/validation";

// GET /api/tasks?scope=abertas|aguardando|concluidas → { tasks } (com checklist)
export const GET = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const { scope } = taskListQuerySchema.parse({ scope: new URL(req.url).searchParams.get("scope") ?? undefined });
  return Response.json({ tasks: await listTasks(ctx, scope) });
});

// POST /api/tasks → 201 { task }
export const POST = handle(async (req: Request) => {
  const ctx = await apiCtx();
  return Response.json({ task: await createTask(ctx, taskCreateSchema.parse(await readJson(req))) }, { status: 201 });
});
