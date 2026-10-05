import "server-only";
// Ações tocadas na notificação. Autenticadas pelo token assinado (não pela sessão).
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, scheduledNotifications, users } from "@/db/schema";
import type { Env } from "../env";
import { updateEvent, type Ctx } from "../events-service";
import { verifyActionToken } from "../push/action-token";
import { HttpError } from "../session";
import { updateTask } from "../tasks-service";
import { SNOOZE_MIN } from "./schedule";

export async function handleNotificationAction(db: Db, env: Env, token: string, action: "concluir" | "adiar") {
  const claims = await verifyActionToken(token, env.AUTH_SECRET);
  if (!claims) throw new HttpError(401, "token inválido ou expirado");
  const [u] = await db.select().from(users).where(eq(users.id, claims.u));
  if (!u) throw new HttpError(401, "usuário não encontrado");
  const ctx: Ctx = { db, env, user: { id: u.id, email: u.email, name: u.name, timezone: u.timezone } };

  if (action === "adiar") {
    const fireAt = new Date(Date.now() + SNOOZE_MIN * 60_000).toISOString();
    await db.insert(scheduledNotifications).values({ userId: u.id, itemType: claims.t, itemId: claims.id, occurrenceStart: claims.occ, fireAt });
    await db.insert(auditLog).values({ userId: u.id, entity: claims.t === "event" ? "events" : "tasks", entityId: claims.id, action: "snooze", source: "app", detail: { fireAt } });
    return { ok: true, action, fireAt };
  }

  if (claims.t === "event") {
    if (claims.rec) throw new HttpError(400, "série recorrente: conclua pela agenda");
    await updateEvent(ctx, claims.id, { status: "concluido" });
  } else {
    await updateTask(ctx, claims.id, { status: "concluida" });
  }
  return { ok: true, action };
}
