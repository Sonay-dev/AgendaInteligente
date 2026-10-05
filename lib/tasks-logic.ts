// Regras puras das tarefas (sem I/O): atraso, agrupamento, transições de status e rascunho a partir de texto.
// Usado no servidor e no navegador; coberto por testes.
import type { QuickDraft } from "./nlp/parse-pt";
import { addDaysYmd, diffDaysYmd, fromZoned, zoned } from "./time";

export const TASK_STATUS = ["a_fazer", "em_andamento", "aguardando", "concluida"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  concluida: "Concluída",
};

export interface TaskLike {
  dueAt: string | null;
  dueAllDay: boolean;
  status: TaskStatus;
  priority: number;
  waitingSince?: string | null;
  lastContactAt?: string | null;
}

/**
 * Atrasada: não concluída e com prazo vencido.
 * Dia inteiro → só depois que o dia termina (no fuso do usuário); com hora → passou do horário.
 */
export function isOverdue(t: TaskLike, now: Date, tz: string): boolean {
  if (!t.dueAt || t.status === "concluida") return false;
  if (!t.dueAllDay) return new Date(t.dueAt).getTime() < now.getTime();
  return zoned(new Date(t.dueAt), tz).ymd < zoned(now, tz).ymd;
}

export type TaskBucket = "atrasadas" | "hoje" | "amanha" | "semana" | "depois" | "sem_data";

export const BUCKET_LABEL: Record<TaskBucket, string> = {
  atrasadas: "Atrasadas",
  hoje: "Hoje",
  amanha: "Amanhã",
  semana: "Próximos 7 dias",
  depois: "Depois",
  sem_data: "Sem data",
};

export function bucketOf(t: TaskLike, now: Date, tz: string): TaskBucket {
  if (!t.dueAt) return "sem_data";
  if (isOverdue(t, now, tz)) return "atrasadas";
  const today = zoned(now, tz).ymd;
  const due = zoned(new Date(t.dueAt), tz).ymd;
  if (due <= today) return "hoje"; // hoje com hora ainda por vir
  if (due === addDaysYmd(today, 1)) return "amanha";
  if (due <= addDaysYmd(today, 7)) return "semana";
  return "depois";
}

/** Ordena: prioridade (P1 primeiro), depois prazo (sem prazo por último). */
export function compareTasks(a: TaskLike, b: TaskLike): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
  return a.dueAt ? -1 : b.dueAt ? 1 : 0;
}

export function groupTasks<T extends TaskLike>(tasks: T[], now: Date, tz: string): { bucket: TaskBucket; items: T[] }[] {
  const order: TaskBucket[] = ["atrasadas", "hoje", "amanha", "semana", "depois", "sem_data"];
  const map = new Map<TaskBucket, T[]>(order.map((b) => [b, []]));
  for (const t of tasks) map.get(bucketOf(t, now, tz))!.push(t);
  return order.map((bucket) => ({ bucket, items: map.get(bucket)!.sort(compareTasks) })).filter((g) => g.items.length);
}

/**
 * Campos que mudam junto com o status:
 * - "aguardando" marca desde quando (se ainda não marcado);
 * - sair de "aguardando" limpa a espera; "concluida" registra a conclusão; reabrir limpa.
 */
export function statusSideEffects(
  current: { status: TaskStatus; waitingSince: string | null; completedAt: string | null },
  next: TaskStatus,
  nowIso: string,
): { waitingSince: string | null; completedAt: string | null } {
  if (current.status === next) return { waitingSince: current.waitingSince, completedAt: current.completedAt };
  return {
    waitingSince: next === "aguardando" ? (current.waitingSince ?? nowIso) : null,
    completedAt: next === "concluida" ? nowIso : null,
  };
}

/** Dias desde o último contato (ou desde que entrou em espera). */
export function daysWaiting(t: TaskLike, now: Date, tz: string): number | null {
  const ref = t.lastContactAt ?? t.waitingSince;
  if (!ref) return null;
  return diffDaysYmd(zoned(now, tz).ymd, zoned(new Date(ref), tz).ymd);
}

/** Prazo (data + hora opcional, na hora local) → ISO UTC armazenado. Dia inteiro = meia-noite local. */
export function dueToIso(ymd: string, hm: string | null, tz: string): string {
  return fromZoned(ymd, hm ?? "00:00", tz).toISOString();
}

/** Frase da caixa de entrada → rascunho de tarefa (o prazo só existe se uma data/hora foi reconhecida). */
export function draftToTask(draft: QuickDraft, rawText: string): {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: number;
} {
  const hasDate = draft.recognized.some((r) => r.kind === "data" || r.kind === "hora");
  return {
    title: draft.title || rawText.trim(),
    dueDate: hasDate ? draft.date : null,
    dueTime: hasDate ? draft.start : null,
    priority: draft.priority ?? 3,
  };
}
