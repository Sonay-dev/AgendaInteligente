import { z } from "zod";
import { isValidRrule } from "./recurrence";
import { TASK_STATUS } from "./tasks-logic";
import { isValidTimeZone } from "./time";

const isoDateTime = z.iso.datetime({ offset: true });
const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const reminderInput = z.object({
  minutesBefore: z.number().int().min(0).max(40320), // até 4 semanas (limite do Google)
  method: z.enum(["popup", "email"]),
});

/** Campos sem valores padrão — base tanto do POST quanto do PATCH. */
const eventBase = z.object({
  title: z.string().trim().min(1, "título obrigatório").max(200),
  description: optionalText(5000),
  location: optionalText(500),
  startAt: isoDateTime,
  endAt: isoDateTime,
  allDay: z.boolean(),
  timezone: z.string().refine(isValidTimeZone, "fuso inválido"),
  categoryId: z.uuid().nullish(),
  contactId: z.uuid().nullish(),
  priority: z.number().int().min(1).max(3),
  status: z.enum(["confirmado", "concluido", "cancelado"]),
  rrule: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || isValidRrule(v), "RRULE inválida")
    .nullish(),
  notes: optionalText(10000),
  nextSteps: optionalText(5000),
  isFocus: z.boolean(),
  reminders: z.array(reminderInput).max(5), // Google aceita até 5 overrides
  allowConflicts: z.boolean(),
});

const endAfterStart = (v: { startAt?: string; endAt?: string }) =>
  !v.startAt || !v.endAt || new Date(v.endAt).getTime() > new Date(v.startAt).getTime();
const endRule = { message: "fim deve ser depois do início", path: ["endAt"] };

export const eventCreateSchema = eventBase
  .extend({
    allDay: eventBase.shape.allDay.default(false),
    timezone: eventBase.shape.timezone.default("America/Sao_Paulo"),
    priority: eventBase.shape.priority.default(3),
    status: eventBase.shape.status.default("confirmado"),
    isFocus: eventBase.shape.isFocus.default(false),
    reminders: eventBase.shape.reminders.optional(),
    allowConflicts: eventBase.shape.allowConflicts.default(false),
  })
  .refine(endAfterStart, endRule);

export const eventPatchSchema = eventBase.partial().refine(endAfterStart, endRule);

export const rangeQuerySchema = z
  .object({ from: isoDateTime, to: isoDateTime })
  .refine((v) => new Date(v.to).getTime() - new Date(v.from).getTime() <= 400 * 86400000, "intervalo máximo de 400 dias");

export const conflictCheckSchema = z.object({
  id: z.uuid().optional(),
  startAt: isoDateTime,
  endAt: isoDateTime,
  allDay: z.boolean().default(false),
  rrule: z.string().nullish(),
  timezone: z.string().refine(isValidTimeZone, "fuso inválido").nullish(),
});

export const duplicateSchema = z.object({
  startAt: isoDateTime.optional(),
  allowConflicts: z.boolean().default(false),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "nome obrigatório").max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "cor inválida (use #rrggbb)").transform((c) => c.toLowerCase()),
});

// ------------------------------------------------------------------ tarefas (8B)
const taskBase = z.object({
  title: z.string().trim().min(1, "título obrigatório").max(200),
  notes: optionalText(10000),
  dueAt: isoDateTime.nullish(),
  dueAllDay: z.boolean(),
  priority: z.number().int().min(1).max(3),
  status: z.enum(TASK_STATUS),
  categoryId: z.uuid().nullish(),
  assignee: optionalText(120), // com quem está (status "aguardando")
});

export const taskCreateSchema = taskBase.extend({
  dueAllDay: taskBase.shape.dueAllDay.default(true),
  priority: taskBase.shape.priority.default(3),
  status: taskBase.shape.status.default("a_fazer"),
  subtasks: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});
export const taskPatchSchema = taskBase.partial().extend({ lastContactAt: isoDateTime.nullish() });
export const taskListQuerySchema = z.object({ scope: z.enum(["abertas", "aguardando", "concluidas"]).default("abertas") });

export const subtaskCreateSchema = z.object({ title: z.string().trim().min(1).max(200) });
export const subtaskPatchSchema = z.object({ title: z.string().trim().min(1).max(200).optional(), done: z.boolean().optional() });

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;

// ------------------------------------------------------------------ caixa de entrada (8A)
export const inboxCreateSchema = z.object({
  rawText: z.string().trim().min(1, "texto vazio").max(2000),
  source: z.enum(["digitado", "voz"]).default("digitado"),
});
export const inboxPatchSchema = z.object({ rawText: z.string().trim().min(1).max(2000) });

/** Triagem: o item vira compromisso, tarefa ou é descartado — numa única chamada. */
export const triageSchema = z.discriminatedUnion("as", [
  z.object({ as: z.literal("event"), event: z.lazy(() => eventCreateSchema) }),
  z.object({ as: z.literal("task"), task: taskCreateSchema }),
  z.object({ as: z.literal("descartado") }),
]);

// ------------------------------------------------------------------ Web Push (8C)
// Só serviços de push conhecidos (evita usar o servidor para chamar URLs arbitrárias).
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
const pushEndpoint = z
  .url()
  .max(1000)
  .refine((u) => {
    const url = new URL(u);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  }, "serviço de push não suportado");
const b64url = (min: number, max: number) => z.string().regex(/^[A-Za-z0-9_-]+=*$/).min(min).max(max);

export const pushSubscribeSchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 30) }),
});
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().max(1000) });
export const notificationActionSchema = z.object({ token: z.string().max(1000), action: z.enum(["concluir", "adiar"]) });

export type CategoryInput = z.infer<typeof categorySchema>;
export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventPatchInput = z.infer<typeof eventPatchSchema>;
export type ReminderInput = z.infer<typeof reminderInput>;

/** Lembretes padrão por prioridade (escalonamento da etapa 8C). */
export const DEFAULT_REMINDERS: Record<number, ReminderInput[]> = {
  1: [
    { minutesBefore: 1440, method: "popup" },
    { minutesBefore: 60, method: "popup" },
    { minutesBefore: 10, method: "popup" },
  ],
  2: [
    { minutesBefore: 60, method: "popup" },
    { minutesBefore: 10, method: "popup" },
  ],
  3: [{ minutesBefore: 10, method: "popup" }],
};
