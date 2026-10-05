// Schema completo (Cloudflare D1 / SQLite). Todas as datas: TEXT ISO 8601 em UTC.
import { sql } from "drizzle-orm";
import { customType, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Date <-> TEXT ISO 8601 (usado nas tabelas do Better Auth, que trabalham com Date). */
const isoDate = customType<{ data: Date; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => value.toISOString(),
  fromDriver: (value) => new Date(value),
});

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => text("created_at").notNull().default(nowIso);
const updatedAt = () => text("updated_at").notNull().default(nowIso);
const bool = (name: string) => integer(name, { mode: "boolean" });

// ------------------------------------------------------------------ Better Auth
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: bool("email_verified").notNull().default(false),
  image: text("image"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  createdAt: isoDate("created_at").notNull(),
  updatedAt: isoDate("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: isoDate("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Contas do Better Auth. Só o provedor "credential" (e-mail + senha, hash PBKDF2 em `password`). */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: isoDate("access_token_expires_at"),
    refreshTokenExpiresAt: isoDate("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: isoDate("expires_at").notNull(),
  createdAt: isoDate("created_at").notNull(),
  updatedAt: isoDate("updated_at").notNull(),
});

// ------------------------------------------------------------------ Domínio
export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#64748b"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("categories_user_name").on(t.userId, t.name)],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    company: text("company"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: text("deleted_at"),
  },
  (t) => [index("contacts_user_idx").on(t.userId)],
);

export const PRIORITIES = [1, 2, 3] as const; // P1 urgente, P2 importante, P3 normal
export const EVENT_STATUS = ["confirmado", "concluido", "cancelado"] as const;
export const SYNC_STATUS = ["pending", "synced", "error"] as const;

export const events = sqliteTable(
  "events",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startAt: text("start_at").notNull(), // ISO UTC
    endAt: text("end_at").notNull(), // ISO UTC (exclusivo p/ dia inteiro)
    allDay: bool("all_day").notNull().default(false),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    priority: integer("priority").notNull().default(3),
    status: text("status", { enum: EVENT_STATUS }).notNull().default("confirmado"),
    rrule: text("rrule"),
    notes: text("notes"), // pauta e decisões
    nextSteps: text("next_steps"),
    isFocus: bool("is_focus").notNull().default(false),
    googleEventId: text("google_event_id"),
    googleEtag: text("google_etag"),
    googleUpdatedAt: text("google_updated_at"),
    syncStatus: text("sync_status", { enum: SYNC_STATUS }).notNull().default("pending"),
    syncAttempts: integer("sync_attempts").notNull().default(0),
    syncError: text("sync_error"),
    nextRetryAt: text("next_retry_at"),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("events_user_start").on(t.userId, t.startAt),
    index("events_sync").on(t.syncStatus, t.nextRetryAt),
    uniqueIndex("events_google_id").on(t.userId, t.googleEventId),
  ],
);

export { TASK_STATUS } from "@/lib/tasks-logic";
import { TASK_STATUS } from "@/lib/tasks-logic";

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: text("due_at"), // ISO UTC
    dueAllDay: bool("due_all_day").notNull().default(true),
    priority: integer("priority").notNull().default(3),
    status: text("status", { enum: TASK_STATUS }).notNull().default("a_fazer"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    assignee: text("assignee"),
    waitingSince: text("waiting_since"),
    lastContactAt: text("last_contact_at"),
    rrule: text("rrule"),
    completedAt: text("completed_at"),
    googleTaskId: text("google_task_id"),
    googleEtag: text("google_etag"),
    syncStatus: text("sync_status", { enum: SYNC_STATUS }).notNull().default("pending"),
    syncAttempts: integer("sync_attempts").notNull().default(0),
    syncError: text("sync_error"),
    nextRetryAt: text("next_retry_at"),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_user_due").on(t.userId, t.dueAt), index("tasks_user_status").on(t.userId, t.status)],
);

export const subtasks = sqliteTable(
  "subtasks",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: bool("done").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subtasks_task_idx").on(t.taskId)],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    minutesBefore: integer("minutes_before").notNull(),
    method: text("method", { enum: ["popup", "email", "push"] }).notNull().default("popup"),
    sentAt: text("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("reminders_event_idx").on(t.eventId), index("reminders_task_idx").on(t.taskId)],
);

export const inboxItems = sqliteTable(
  "inbox_items",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rawText: text("raw_text").notNull(),
    source: text("source", { enum: ["digitado", "voz"] }).notNull().default("digitado"),
    processed: bool("processed").notNull().default(false),
    processedAs: text("processed_as", { enum: ["event", "task", "descartado"] }),
    processedRefId: text("processed_ref_id"),
    createdAt: createdAt(),
  },
  (t) => [index("inbox_user_processed").on(t.userId, t.processed)],
);

export const recurringTemplates = sqliteTable("recurring_templates", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug"),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["tarefa", "compromisso", "vencimento"] }).notNull().default("tarefa"),
  rrule: text("rrule").notNull(),
  alertDays: text("alert_days", { mode: "json" }).$type<number[]>(),
  priority: integer("priority").notNull().default(2),
  defaultTime: text("default_time"), // HH:MM
  active: bool("active").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const GOOGLE_CONNECTION_STATUS = ["active", "revoked", "disconnected"] as const;

/**
 * Integração com o Google (separada do login). Uma conexão por usuário.
 * accessToken/refreshToken ficam CRIPTOGRAFADOS (AES-GCM, lib/crypto.ts).
 */
export const googleConnections = sqliteTable("google_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  googleSub: text("google_sub").notNull(),
  googleEmail: text("google_email").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: text("access_token_expires_at"),
  scope: text("scope"),
  /**
   * active | revoked (Google devolveu invalid_grant: reconectar) | disconnected (o usuário desconectou;
   * tokens apagados, googleSub mantido para saber se a reconexão é com a mesma conta).
   */
  status: text("status", { enum: GOOGLE_CONNECTION_STATUS }).notNull().default("active"),
  connectedAt: text("connected_at").notNull().default(nowIso),
  updatedAt: updatedAt(),
});

/** Estado da sincronização por usuário e recurso ("calendar" | "tasks"). */
export const syncState = sqliteTable(
  "sync_state",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    resource: text("resource", { enum: ["calendar", "tasks"] }).notNull(),
    syncToken: text("sync_token"),
    channelId: text("channel_id"),
    resourceId: text("resource_id"),
    channelToken: text("channel_token"),
    channelExpiration: text("channel_expiration"),
    lastSyncAt: text("last_sync_at"),
    lastFullSyncAt: text("last_full_sync_at"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.resource] }), index("sync_state_channel").on(t.channelId)],
);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
});

export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    channel: text("channel").notNull().default("push"),
    itemType: text("item_type"),
    itemId: text("item_id"),
    title: text("title"),
    sentAt: text("sent_at").notNull().default(nowIso),
  },
  (t) => [uniqueIndex("notification_user_key").on(t.userId, t.key)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(), // events | tasks | auth | sync
    entityId: text("entity_id"),
    action: text("action").notNull(), // create | update | delete | conflict | sync_error ...
    source: text("source", { enum: ["app", "google", "cron", "system"] }).notNull().default("app"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_user_created").on(t.userId, t.createdAt)],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type ReminderRow = typeof reminders.$inferSelect;
export type SyncStateRow = typeof syncState.$inferSelect;
export type GoogleConnectionRow = typeof googleConnections.$inferSelect;
