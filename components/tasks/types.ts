import type { TaskStatus } from "@/lib/tasks-logic";
import { addDaysYmd, zoned } from "@/lib/time";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  dueAllDay: boolean;
  priority: number;
  status: TaskStatus;
  categoryId: string | null;
  assignee: string | null;
  waitingSince: string | null;
  lastContactAt: string | null;
  completedAt: string | null;
  subtasks: Subtask[];
}

export interface TaskPayload {
  title: string;
  notes?: string | null;
  dueAt: string | null;
  dueAllDay: boolean;
  priority: number;
  status: TaskStatus;
  categoryId: string | null;
  assignee?: string | null;
  subtasks?: string[];
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "hoje", "amanhã · 15:00", "ontem", "seg, 12 out". */
export function formatDue(dueAt: string, allDay: boolean, tz: string, now = new Date()): string {
  const z = zoned(new Date(dueAt), tz);
  const today = zoned(now, tz).ymd;
  const day =
    z.ymd === today
      ? "hoje"
      : z.ymd === addDaysYmd(today, 1)
        ? "amanhã"
        : z.ymd === addDaysYmd(today, -1)
          ? "ontem"
          : `${WEEKDAYS[z.dow]}, ${z.d} ${MONTHS[z.m - 1]}${z.y !== zoned(now, tz).y ? ` ${z.y}` : ""}`;
  return allDay ? day : `${day} · ${z.hm}`;
}
