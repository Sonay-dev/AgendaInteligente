import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { googleConnections } from "@/db/schema";
import { safeEqual } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { ensureWatch, pullCalendar, pushPending } from "@/lib/google/calendar-sync";
import { runReminders, usersWithDevices } from "@/lib/reminders/engine";

// Chamado pelo Cron Trigger (custom-worker.ts → scheduled) a cada 5 min.
// Etapa 6: reenvio de pendentes com backoff, renovação do events.watch e sync incremental de segurança.
// Etapa 8C: lembretes por Web Push.
export async function POST(req: Request): Promise<Response> {
  const env = await getEnv();
  const auth = req.headers.get("authorization") ?? "";
  if (!env.CRON_SECRET || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return new Response(null, { status: 401 });

  const db = await getDb();
  const users = await db.select({ userId: googleConnections.userId }).from(googleConnections).where(eq(googleConnections.status, "active"));
  const report: Record<string, unknown> = {};
  for (const { userId } of users) {
    const ctx = { db, env, userId };
    const r: Record<string, unknown> = {};
    for (const [name, step] of [
      ["pushed", () => pushPending(ctx, 6)],
      ["watch", () => ensureWatch(ctx)],
      ["pulled", () => pullCalendar(ctx)],
    ] as const) {
      try {
        r[name] = await step();
      } catch (e) {
        r[name] = { error: e instanceof Error ? e.name : "erro" };
      }
    }
    report[userId] = r;
  }
  // Etapa 8C: lembretes escalonados por Web Push (usuários com aparelho inscrito)
  const reminders: Record<string, unknown> = {};
  for (const userId of await usersWithDevices(db)) {
    try {
      reminders[userId] = await runReminders(db, env, userId);
    } catch (e) {
      reminders[userId] = { error: e instanceof Error ? e.message.slice(0, 200) : "erro" };
    }
  }
  return Response.json({ ok: true, at: new Date().toISOString(), users: users.length, report, reminders });
}
