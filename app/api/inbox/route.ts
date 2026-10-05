import { apiCtx, readJson } from "@/lib/api";
import { captureInbox, listInbox } from "@/lib/inbox-service";
import { handle } from "@/lib/session";
import { inboxCreateSchema } from "@/lib/validation";

// GET /api/inbox → itens ainda não processados (mais novos primeiro)
export const GET = handle(async () => {
  const ctx = await apiCtx();
  return Response.json({ items: await listInbox(ctx) });
});

// POST /api/inbox { rawText, source: "digitado" | "voz" } → 201 { item }
export const POST = handle(async (req: Request) => {
  const ctx = await apiCtx();
  const { rawText, source } = inboxCreateSchema.parse(await readJson(req));
  return Response.json({ item: await captureInbox(ctx, rawText, source) }, { status: 201 });
});
