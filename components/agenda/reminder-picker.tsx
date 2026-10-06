"use client";
import { useState } from "react";
import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_REMINDERS, MAX_REMINDER_MINUTES, REMINDER_PRESETS, formatReminder, toggleReminder } from "@/lib/reminders/defaults";
import { cn } from "@/lib/utils";

const UNITS = [
  { label: "min", factor: 1 },
  { label: "horas", factor: 60 },
  { label: "dias", factor: 1440 },
];

interface Props {
  value: number[];
  onChange: (value: number[]) => void;
  /** true = os lembretes mostrados são o padrão da prioridade (ainda não mexidos). */
  isDefault: boolean;
  onResetDefault: () => void;
  selectClass: string;
}

export function ReminderPicker({ value, onChange, isDefault, onResetDefault, selectClass }: Props) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [factor, setFactor] = useState(1);
  const full = value.length >= MAX_REMINDERS;
  // chips: atalhos + qualquer valor personalizado já escolhido
  const chips = [...new Set([...REMINDER_PRESETS, ...value])].sort((a, b) => a - b);

  const otherMinutes = Number(amount) * factor;
  const otherValid = amount !== "" && Number.isInteger(otherMinutes) && otherMinutes >= 0 && otherMinutes <= MAX_REMINDER_MINUTES;

  function addOther() {
    if (!otherValid) return;
    if (!value.includes(otherMinutes)) onChange(toggleReminder(value, otherMinutes));
    setAmount("");
    setOtherOpen(false);
  }

  return (
    <div className="grid gap-1.5" role="group" aria-labelledby="reminders-label">
      <div className="flex items-center justify-between gap-2">
        <span id="reminders-label" className="flex items-center gap-1.5 text-sm font-medium">
          <Bell className="size-3.5" aria-hidden /> Lembretes
        </span>
        <span className="text-xs text-muted-foreground">
          {isDefault ? (
            "padrão da prioridade"
          ) : (
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onResetDefault}>
              voltar ao padrão
            </button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((m) => {
          const on = value.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-40",
                on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
              onClick={() => onChange(toggleReminder(value, m))}
            >
              {formatReminder(m)}
            </button>
          );
        })}
        {!otherOpen && (
          <button
            type="button"
            disabled={full}
            className="flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-xs font-medium hover:bg-muted disabled:opacity-40"
            onClick={() => setOtherOpen(true)}
          >
            <Plus className="size-3" aria-hidden /> Outro
          </button>
        )}
      </div>
      {otherOpen && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Quanto tempo antes"
            inputMode="numeric"
            className="w-20"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOther();
              }
            }}
          />
          <select aria-label="Unidade" className={cn(selectClass, "w-24")} value={factor} onChange={(e) => setFactor(Number(e.target.value))}>
            {UNITS.map((u) => (
              <option key={u.factor} value={u.factor}>
                {u.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">antes</span>
          <Button type="button" size="sm" disabled={!otherValid} onClick={addOther}>
            Adicionar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOtherOpen(false)}>
            Cancelar
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {value.length === 0 ? "Sem lembretes: o celular não vai avisar." : `Até ${MAX_REMINDERS} lembretes. Vão também para o Google Agenda.`}
      </p>
    </div>
  );
}
