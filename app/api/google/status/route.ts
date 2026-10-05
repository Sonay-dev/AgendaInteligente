import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLog, syncState } from "@/db/schema";
import { apiCtx } from "@/lib/api";
import { pendingCount } from "@/lib/google/calendar-sync";
import { getConnection } from "@/lib/google/oauth";
import { handle } from "@/lib/session";

// GET /api/google/status → estado da integração (tela /configuracoes e painel da agenda)
export const GET = handle(async () => {
  const { db, user } = await apiCtx();
  const [conn, pending, [state], recent] = await Promise.all([
    getConnection(db, user.id),
    pendingCount(db, user.id),
    db.select().from(syncState).where(and(eq(syncState.userId, user.id), eq(syncState.resource, "calendar"))),
    db
      .select({ action: auditLog.action, entityId: auditLog.entityId, source: auditLog.source, detail: auditLog.detail, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.userId, user.id), inArray(auditLog.action, ["sync_error", "conflict", "full_sync_410", "watch_renewed", "google_connected", "google_disconnected", "google_create", "google_update", "google_delete"])))
      .orderBy(desc(auditLog.createdAt))
      .limit(15),
  ]);
  return Response.json({
    user: { email: user.email },
    google: conn
      ? { status: conn.status, connected: conn.status === "active", email: conn.googleEmail, connectedAt: conn.connectedAt }
      : { status: "never", connected: false, email: null, connectedAt: null },
    pending,
    sync: state
      ? {
          incremental: !!state.syncToken && !state.syncToken.startsWith("page:"),
          lastSyncAt: state.lastSyncAt,
          lastFullSyncAt: state.lastFullSyncAt,
          channelExpiration: state.channelExpiration,
        }
      : null,
    recent,
  });
});
