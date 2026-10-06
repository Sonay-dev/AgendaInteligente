"use client";
import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultReminderMinutes } from "@/lib/reminders/defaults";
import { addDaysYmd, formatDateTime, fromZoned, zoned } from "@/lib/time";
import type { QuickDraft } from "@/lib/nlp/parse-pt";
import { cn } from "@/lib/utils";
import type { CalendarEvent, Category, Conflict, EventPayload } from "./api";
import { ReminderPicker } from "./reminder-picker";

const RRULES = [
  { label: "Não repete", value: "" },
  { label: "Todo dia", value: "FREQ=DAILY" },
  { label: "Dias úteis", value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Toda semana", value: "FREQ=WEEKLY" },
  { label: "Todo mês", value: "FREQ=MONTHLY" },
  { label: "Todo ano", value: "FREQ=YEARLY" },
];
const BYDAY = [
  { code: "MO", label: "S", name: "segunda" },
  { code: "TU", label: "T", name: "terça" },
  { code: "WE", label: "Q", name: "quarta" },
  { code: "TH", label: "Q", name: "quinta" },
  { code: "FR", label: "S", name: "sexta" },
  { code: "SA", label: "S", name: "sábado" },
  { code: "SU", label: "D", name: "domingo" },
];
const CUSTOM_WEEKLY = "__dias__";

function weeklyDays(rrule: string): string[] | null {
  const m = /^FREQ=WEEKLY;BYDAY=([A-Z,]+)$/.exec(rrule);
  return m ? m[1]!.split(",") : null;
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface FormInitial {
  event?: CalendarEvent & { reminders?: { minutesBefore: number; method: "popup" | "email" }[] };
  date?: string; // YYYY-MM-DD
  time?: string | null; // HH:MM (null = dia inteiro)
  draft?: QuickDraft; // criação rápida por texto
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: FormInitial;
  timezone: string;
  categories: Category[];
  onSubmit: (payload: EventPayload) => Promise<{ conflicts?: Conflict[]; error?: string } | void>;
}

export function EventForm(props: Props) {
  // remonta o formulário a cada abertura → estado inicial sempre limpo
  return props.open ? <EventFormInner {...props} /> : null;
}

function EventFormInner({ open, onOpenChange, initial, timezone, categories, onSubmit }: Props) {
  const ev = initial.event;
  const draft = initial.draft;
  const tz = ev?.timezone ?? timezone;
  const startZ = ev ? zoned(new Date(ev.startAt), tz) : null;
  const endZ = ev ? zoned(new Date(ev.endAt), tz) : null;
  const initialTime = draft ? draft.start : initial.time;

  const [title, setTitle] = useState(ev?.title ?? draft?.title ?? "");
  const [date, setDate] = useState(startZ?.ymd ?? draft?.date ?? initial.date ?? zoned(new Date(), tz).ymd);
  const [start, setStart] = useState(startZ?.hm ?? initialTime ?? "09:00");
  const [end, setEnd] = useState(endZ?.hm ?? draft?.end ?? addHour(initialTime ?? "09:00"));
  const [allDay, setAllDay] = useState(ev?.allDay ?? (draft ? draft.allDay : initial.time === null));
  const [location, setLocation] = useState(ev?.location ?? "");
  const [description, setDescription] = useState(ev?.description ?? "");
  const [priority, setPriority] = useState(ev?.priority ?? draft?.priority ?? 3);
  const [categoryId, setCategoryId] = useState(ev?.categoryId ?? "");
  const [rrule, setRrule] = useState(ev?.rrule ?? draft?.rrule ?? "");
  const days = weeklyDays(rrule);
  const presetMatch = RRULES.some((r) => r.value === rrule);
  const repeatValue = presetMatch ? rrule : days ? CUSTOM_WEEKLY : rrule;
  // null = segue o padrão da prioridade (muda junto com ela) até o usuário mexer
  const [customReminders, setCustomReminders] = useState<number[] | null>(
    ev?.reminders ? [...new Set(ev.reminders.map((r) => r.minutesBefore))].sort((a, b) => b - a) : null,
  );
  const reminderMinutes = customReminders ?? defaultReminderMinutes(priority);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(allowConflicts: boolean) {
    setError(null);
    let startAt: Date, endAt: Date;
    if (allDay) {
      startAt = fromZoned(date, "00:00", tz);
      endAt = fromZoned(addDaysYmd(date, 1), "00:00", tz);
    } else {
      startAt = fromZoned(date, start, tz);
      endAt = fromZoned(date, end, tz);
      if (endAt <= startAt) endAt = fromZoned(addDaysYmd(date, 1), end, tz); // atravessa a meia-noite
    }
    const payload: EventPayload = {
      title: title.trim(),
      description: description || null,
      location: location || null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      allDay,
      timezone: tz,
      priority,
      categoryId: categoryId || null,
      rrule: rrule || null,
      // sempre explícito: o que aparece marcado é o que vai para o servidor e para o Google
      reminders: reminderMinutes.map((m) => ({ minutesBefore: m, method: "popup" as const })),
      allowConflicts,
    };
    setSaving(true);
    const res = await onSubmit(payload);
    setSaving(false);
    if (res?.conflicts?.length) setConflicts(res.conflicts);
    else if (res?.error) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ev ? "Editar compromisso" : draft ? "Confirme o compromisso" : "Novo compromisso"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="date">Data</Label>
              <Input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="start">Início</Label>
              <Input id="start" type="time" disabled={allDay} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="end">Fim</Label>
              <Input id="end" type="time" disabled={allDay} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Dia inteiro
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="category">Categoria</Label>
              <select id="category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priority">Prioridade</Label>
              <select id="priority" className={selectClass} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>P1 urgente</option>
                <option value={2}>P2 importante</option>
                <option value={3}>P3 normal</option>
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rrule">Repetição</Label>
            <select
              id="rrule"
              className={selectClass}
              value={repeatValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== CUSTOM_WEEKLY) return setRrule(v);
                // começa pelo dia da semana da data escolhida
                const dow = zoned(fromZoned(date, "12:00", tz), tz).dow;
                setRrule(`FREQ=WEEKLY;BYDAY=${BYDAY[(dow + 6) % 7]!.code}`);
              }}
            >
              {RRULES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
              <option value={CUSTOM_WEEKLY}>Dias da semana…</option>
              {!presetMatch && !days && rrule ? <option value={rrule}>Personalizada ({rrule})</option> : null}
            </select>
            {days && !presetMatch && (
              <div className="flex gap-1" role="group" aria-label="Dias da semana">
                {BYDAY.map((d) => {
                  const on = days.includes(d.code);
                  return (
                    <button
                      key={d.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.name}
                      title={d.name}
                      className={cn(
                        "grid size-8 place-items-center rounded-full border text-xs font-medium",
                        on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                      onClick={() => {
                        const next = on ? days.filter((x) => x !== d.code) : [...days, d.code];
                        if (!next.length) return;
                        const ordered = BYDAY.map((x) => x.code).filter((c) => next.includes(c));
                        setRrule(`FREQ=WEEKLY;BYDAY=${ordered.join(",")}`);
                      }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}
            {rrule && <p className="text-xs text-muted-foreground">A data acima é a primeira ocorrência.</p>}
          </div>
          <ReminderPicker
            value={reminderMinutes}
            onChange={setCustomReminders}
            isDefault={customReminders === null}
            onResetDefault={() => setCustomReminders(null)}
            selectClass={selectClass}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="location">Local</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {conflicts && (
            <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-4" aria-hidden /> Conflito de horário com:
              </p>
              <ul className="ml-5 list-disc text-muted-foreground">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    {c.title} — {formatDateTime(c.startAt, tz)}
                    {c.isFocus ? " (bloco de foco)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            {conflicts ? (
              <Button type="button" variant="outline" disabled={saving} onClick={() => void submit(true)}>
                Salvar mesmo assim
              </Button>
            ) : null}
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function addHour(hm: string): string {
  const [h = 9, m = 0] = hm.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
