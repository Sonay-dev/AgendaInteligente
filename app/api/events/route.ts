import { apiCtx, readJson } from "@/lib/api";
import { createEvent, listEvents } from "@/lib/events-service";
import { handle } from "@/lib/session";
import { eventCreateSchema, rangeQuerySchema } from "@/lib/validation";

// GET /api/events?from=ISO&to=ISO  → ocorrências no intervalo (séries expandidas)
export const GET = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const url = new URL(req.url);
  const { from, to } = rangeQuerySchema.parse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  return Response.json({ events: await listEvents(ctx, from, to) });
});

// POST /api/events  → 201 { event, conflicts } | 409 { details.conflicts } (reenvie com allowConflicts: true)
export const POST = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const input = eventCreateSchema.parse(await readJson(req));
  return Response.json(await createEvent(ctx, input), { status: 201 });
});
