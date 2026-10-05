"use client";

export interface Reminder {
  minutesBefore: number;
  method: "popup" | "email";
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  priority: number;
  categoryId: string | null;
  status: "confirmado" | "concluido" | "cancelado";
  rrule: string | null;
  isFocus: boolean;
  syncStatus: "pending" | "synced" | "error";
  syncError: string | null;
  occurrenceStart: string;
  occurrenceEnd: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Conflict {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  isFocus: boolean;
}

export interface EventPayload {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  priority: number;
  categoryId?: string | null;
  rrule?: string | null;
  reminders?: Reminder[];
  allowConflicts?: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; conflicts?: Conflict[] };

export async function api<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body: unknown = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: body as T };
    const err = body as { error?: string; details?: { conflicts?: Conflict[] } };
    return { ok: false, status: res.status, error: err.error ?? `erro ${res.status}`, conflicts: err.details?.conflicts };
  } catch {
    return { ok: false, status: 0, error: "sem conexão" };
  }
}
