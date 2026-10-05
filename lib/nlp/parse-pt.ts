// Criação rápida em português: "reunião com João amanhã às 15h por 1h" → rascunho do formulário.
// Puro e determinístico (recebe `now` e o fuso) → coberto por testes. Roda no navegador e no servidor.
// Horas, durações, datas relativas e recorrência são regras próprias (o chrono pt não entende "15h",
// "depois de amanhã", "dia 12"…); o chrono-node pt cuida das datas explícitas ("15/10", "10 de novembro").
import * as chronoPt from "chrono-node/pt"; // só o locale pt (bundle menor no navegador)
import { addDaysYmd, zoned } from "../time";

export interface QuickDraft {
  title: string;
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM (null = dia inteiro)
  end: string | null; // HH:MM
  allDay: boolean;
  rrule: string | null;
  priority: number | null;
  /** Pedaços reconhecidos, para mostrar ao usuário o que foi entendido. */
  recognized: { kind: "data" | "hora" | "duracao" | "repeticao" | "prioridade"; label: string }[];
}

const L = "\\p{L}\\d"; // letras (com acento) e dígitos
const B = `(?<![${L}])`; // início de palavra (\b não entende acentos)
const E = `(?![${L}])`; // fim de palavra
const re = (src: string) => new RegExp(src, "iu");

const pad = (n: number) => String(n).padStart(2, "0");
const hmOf = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

// ---------------------------------------------------------------- dias da semana
const WEEKDAYS: { re: string; code: string; dow: number; short: string }[] = [
  { re: "seg(?:unda)?(?:-feira)?s?", code: "MO", dow: 1, short: "seg" },
  { re: "ter(?:ça|ca)?(?:-feira)?s?", code: "TU", dow: 2, short: "ter" },
  { re: "qua(?:rta)?(?:-feira)?s?", code: "WE", dow: 3, short: "qua" },
  { re: "qui(?:nta)?(?:-feira)?s?", code: "TH", dow: 4, short: "qui" },
  { re: "sex(?:ta)?(?:-feira)?s?", code: "FR", dow: 5, short: "sex" },
  { re: "s[áa]b(?:ado)?s?", code: "SA", dow: 6, short: "sáb" },
  { re: "dom(?:ingo)?s?", code: "SU", dow: 0, short: "dom" },
];
const WD_ANY = `(?:${WEEKDAYS.map((w) => w.re).join("|")})`;

function weekdayOf(token: string) {
  return WEEKDAYS.find((w) => re(`^${w.re}$`).test(token.trim()));
}

const NUM_WORDS: Record<string, number> = { uma: 1, um: 1, duas: 2, dois: 2, "três": 3, tres: 3, quatro: 4 };

/** Remove o trecho casado do texto (mantém os índices estáveis com espaços). */
class Text {
  constructor(public rest: string) {}
  take(regex: RegExp): RegExpExecArray | null {
    const m = regex.exec(this.rest);
    if (m) this.rest = this.rest.slice(0, m.index) + " ".repeat(m[0].length) + this.rest.slice(m.index + m[0].length);
    return m;
  }
}

// ---------------------------------------------------------------- horas
function toMinutes(h: string, m?: string, period?: string): number | null {
  let hour = Number(h);
  const minute = m ? Number(m) : 0;
  if (period) {
    const p = period.toLowerCase();
    if ((p.startsWith("tarde") || p.startsWith("noite")) && hour < 12) hour += 12;
    if (p.startsWith("manh") && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

const PERIOD = `(?:\\s+(?:da|de)\\s+(manh[ãa]|tarde|noite|madrugada))?`;
const CLOCK = `(\\d{1,2})(?:\\s*(?:h|:)\\s*(\\d{2})?|\\s*h(?:oras?)?)`; // 15h, 15h30, 9:30, 15 horas

function takeTimeRange(t: Text): [number, number] | null {
  const m =
    t.take(re(`${B}(?:das?|de)\\s+(\\d{1,2})(?:\\s*[h:]\\s*(\\d{2})?)?\\s*(?:h)?\\s*(?:às|as|a|até|ate|-)\\s*(\\d{1,2})(?:\\s*[h:]\\s*(\\d{2})?)?h?${PERIOD}${E}`)) ??
    t.take(re(`${B}(\\d{1,2})\\s*[h:]\\s*(\\d{2})?\\s*(?:-|–|até|ate)\\s*(\\d{1,2})(?:\\s*[h:]\\s*(\\d{2})?)?h?${PERIOD}${E}`));
  if (!m) return null;
  const s = toMinutes(m[1]!, m[2], m[5]);
  const e = toMinutes(m[3]!, m[4], m[5]);
  return s === null || e === null ? null : [s, e];
}

function takeTime(t: Text): number | null {
  if (t.take(re(`${B}(?:ao\\s+|à\\s+|a\\s+)?meio[\\s-]dia${E}`))) return 12 * 60;
  if (t.take(re(`${B}(?:à\\s+|a\\s+)?meia[\\s-]noite${E}`))) return 0;
  const m =
    t.take(re(`${B}(?:(?:às|as|a partir das|lá pelas|pelas)\\s+)?${CLOCK}${PERIOD}${E}`)) ??
    t.take(re(`${B}(?:às|as)\\s+(\\d{1,2})()${PERIOD}${E}`)); // "às 6", "às 8 da noite"
  return m ? toMinutes(m[1]!, m[2] || undefined, m[3]) : null;
}

function takeDuration(t: Text): number | null {
  if (t.take(re(`${B}(?:por|durante)\\s+meia\\s+hora${E}`))) return 30;
  let m = t.take(re(`${B}(?:por|durante)\\s+(\\d{1,2})\\s*h(?:oras?)?(?:\\s*(?:e\\s*)?(\\d{1,2})\\s*(?:min(?:utos?)?)?)?${E}`));
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  m = t.take(re(`${B}(?:por|durante)\\s+(\\d{1,3})\\s*min(?:utos?)?${E}`));
  if (m) return Number(m[1]);
  m = t.take(re(`${B}(?:por|durante)\\s+(uma|duas|tr[êe]s|quatro)\\s+horas?(\\s+e\\s+meia)?${E}`));
  if (m) return (NUM_WORDS[m[1]!.toLowerCase()] ?? 1) * 60 + (m[2] ? 30 : 0);
  return null;
}

// ---------------------------------------------------------------- recorrência
interface Recurrence {
  rrule: string;
  byDay?: number[]; // dow das ocorrências semanais
  monthDay?: number;
  label: string;
}

function takeRecurrence(t: Text): Recurrence | null {
  if (t.take(re(`${B}(?:tod[oa]s?\\s+(?:os\\s+)?dias?\\s+[úu]te(?:is|l)|(?:nos\\s+)?dias\\s+[úu]teis|de\\s+segunda\\s+a\\s+sexta(?:-feira)?)${E}`))) {
    return { rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", byDay: [1, 2, 3, 4, 5], label: "dias úteis" };
  }
  let m = t.take(re(`${B}tod[oa]\\s+dia\\s+(\\d{1,2})${E}`));
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    return { rrule: `FREQ=MONTHLY;BYMONTHDAY=${Number(m[1])}`, monthDay: Number(m[1]), label: `todo dia ${Number(m[1])}` };
  }
  if (t.take(re(`${B}(?:todos\\s+os\\s+dias|todo\\s+dia|diariamente)${E}`))) return { rrule: "FREQ=DAILY", label: "todo dia" };

  // "seg, qua e sex", "toda segunda", "todas as terças e quintas", "às segundas"
  m = t.take(re(`${B}(?:(tod[oa]s?)\\s+(?:as?\\s+|os?\\s+)?|(?:às|as|aos)\\s+)?(${WD_ANY}(?:\\s*(?:,|/|\\se\\s)\\s*${WD_ANY})*)${E}`));
  if (m) {
    const tokens = m[2]!.split(/\s*(?:,|\/|\se\s)\s*/u).map(weekdayOf).filter((w) => !!w);
    const unique = [...new Map(tokens.map((w) => [w.code, w])).values()].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7));
    // recorrente: 2+ dias ("seg, qua e sex"), "toda segunda" ou plural ("às terças")
    if (unique.length >= 2 || m[1] || /s$/i.test(m[2]!.trim())) {
      return {
        rrule: `FREQ=WEEKLY;BYDAY=${unique.map((w) => w.code).join(",")}`,
        byDay: unique.map((w) => w.dow),
        label: `toda ${unique.map((w) => w.short).join(", ")}`,
      };
    }
    // um dia só, sem "toda": é uma data (a próxima ocorrência) → devolve o texto para o passo de datas
    t.rest = t.rest.slice(0, m.index) + m[0] + t.rest.slice(m.index + m[0].length);
  }
  if (t.take(re(`${B}(?:toda\\s+semana|todas\\s+as\\s+semanas|semanalmente)${E}`))) return { rrule: "FREQ=WEEKLY", label: "toda semana" };
  if (t.take(re(`${B}(?:todo\\s+m[êe]s|todos\\s+os\\s+meses|mensalmente)${E}`))) return { rrule: "FREQ=MONTHLY", label: "todo mês" };
  if (t.take(re(`${B}(?:todo\\s+ano|todos\\s+os\\s+anos|anualmente)${E}`))) return { rrule: "FREQ=YEARLY", label: "todo ano" };
  return null;
}

// ---------------------------------------------------------------- datas
function nextWeekday(todayYmd: string, todayDow: number, dow: number, skipToday: boolean): string {
  let diff = (dow - todayDow + 7) % 7;
  if (diff === 0 && skipToday) diff = 7;
  return addDaysYmd(todayYmd, diff);
}

function takeDate(t: Text, todayYmd: string, todayDow: number, now: Date, tz: string): { ymd: string; label: string } | null {
  if (t.take(re(`${B}depois\\s+de\\s+amanh[ãa]${E}`))) return { ymd: addDaysYmd(todayYmd, 2), label: "depois de amanhã" };
  if (t.take(re(`${B}amanh[ãa]${E}`))) return { ymd: addDaysYmd(todayYmd, 1), label: "amanhã" };
  if (t.take(re(`${B}hoje${E}`))) return { ymd: todayYmd, label: "hoje" };
  let m = t.take(re(`${B}(?:daqui\\s+a|em)\\s+(\\d{1,3})\\s+dias?${E}`));
  if (m) return { ymd: addDaysYmd(todayYmd, Number(m[1])), label: `em ${m[1]} dias` };
  if (t.take(re(`${B}(?:semana\\s+que\\s+vem|pr[óo]xima\\s+semana)${E}`))) {
    return { ymd: nextWeekday(todayYmd, todayDow, 1, true), label: "semana que vem" };
  }

  // "próxima terça", "na sexta", "segunda que vem"
  m = t.take(re(`${B}(?:(pr[óo]xim[ao]|n[ao]|nest[ae]|est[ae])\\s+)?(${WD_ANY})(\\s+que\\s+vem)?${E}`));
  if (m) {
    const w = weekdayOf(m[2]!);
    if (w) {
      const skip = !!m[3] || /^pr/i.test(m[1] ?? "");
      return { ymd: nextWeekday(todayYmd, todayDow, w.dow, skip), label: `${w.short}` };
    }
  }

  // "dia 12" → próximo dia 12 (este mês ou o próximo)
  m = t.take(re(`${B}(?:n?o\\s+)?dia\\s+(\\d{1,2})${E}(?!\\s*(?:/|de\\s))`));
  if (m) {
    const day = Number(m[1]);
    const [y, mo, d] = todayYmd.split("-").map(Number) as [number, number, number];
    for (let i = 0; i < 3; i++) {
      const dt = new Date(Date.UTC(y, mo - 1 + i + (day < d && i === 0 ? 1 : 0), day));
      if (dt.getUTCDate() === day) {
        const ymd = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(day)}`;
        return { ymd, label: `dia ${day}` };
      }
    }
  }

  // datas explícitas: "15/10", "15/10/2026", "10 de novembro" (chrono pt)
  const z = zoned(now, tz);
  const ref = { instant: new Date(Date.UTC(z.y, z.m - 1, z.d, 12)), timezone: 0 };
  const found = chronoPt.parse(t.rest, ref, { forwardDate: true }).find((r) => r.start.isCertain("day") && r.start.isCertain("month"));
  if (found) {
    t.rest = t.rest.slice(0, found.index) + " ".repeat(found.text.length) + t.rest.slice(found.index + found.text.length);
    t.take(re(`${B}(?:n?o\\s+)?dia\\s*$`)); // "no dia 15/10" → sobra "no dia"
    const s = found.start;
    const ymd = `${s.get("year")}-${pad(s.get("month")!)}-${pad(s.get("day")!)}`;
    return { ymd, label: `${pad(s.get("day")!)}/${pad(s.get("month")!)}` };
  }
  return null;
}

function takePriority(t: Text): number | null {
  if (t.take(re(`${B}(?:urgente|p1)${E}`))) return 1;
  if (t.take(re(`${B}(?:importante|p2)${E}`))) return 2;
  return null;
}

// ---------------------------------------------------------------- título
const DANGLING = new RegExp(`(?:^|\\s)(?:às|as|a|à|ao|no|na|nos|nas|em|de|do|da|dia|para|pra|por|e|,|-|–)\\s*$`, "iu");
const LEADING = new RegExp(`^\\s*(?:,|-|–|e\\s)\\s*`, "iu");

function cleanTitle(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(DANGLING, "").replace(LEADING, "").replace(/\s*,\s*,/g, ",").trim();
    if (s === before) break;
  }
  s = s.replace(/\s+,/g, ",").replace(/,$/, "").trim();
  return s ? s[0]!.toLocaleUpperCase("pt-BR") + s.slice(1) : "";
}

/**
 * Interpreta uma frase. Datas no passado não são corrigidas aqui: o formulário mostra tudo para confirmar.
 * Sem hora → dia inteiro. Sem duração → 1 hora.
 */
export function parseQuickAdd(input: string, now: Date, tz: string): QuickDraft {
  const t = new Text(` ${input} `);
  const today = zoned(now, tz);
  const recognized: QuickDraft["recognized"] = [];

  const priority = takePriority(t);
  const duration = takeDuration(t);
  const range = takeTimeRange(t);
  const recurrence = takeRecurrence(t);
  const time = range ? range[0] : takeTime(t);
  const date = recurrence?.byDay || recurrence?.monthDay ? null : takeDate(t, today.ymd, today.dow, now, tz);

  let ymd = date?.ymd ?? today.ymd;
  if (recurrence?.byDay) {
    // primeira ocorrência: hoje (se ainda não passou) ou o próximo dia da lista
    const passed = time !== null && time <= today.h * 60 + today.mi;
    const candidates = recurrence.byDay.map((dow) => nextWeekday(today.ymd, today.dow, dow, false));
    ymd = candidates.map((c) => (c === today.ymd && passed ? addDaysYmd(c, 7) : c)).sort()[0]!;
  } else if (recurrence?.monthDay) {
    const [y, mo, d] = today.ymd.split("-").map(Number) as [number, number, number];
    const md = recurrence.monthDay;
    const target = md < d || (md === d && time !== null && time <= today.h * 60 + today.mi) ? new Date(Date.UTC(y, mo, md)) : new Date(Date.UTC(y, mo - 1, md));
    ymd = `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
  }

  let start: string | null = null;
  let end: string | null = null;
  if (time !== null) {
    start = hmOf(time);
    const endMin = range ? range[1] : time + (duration ?? 60);
    end = hmOf(endMin);
  }

  if (date) recognized.push({ kind: "data", label: date.label });
  if (start) recognized.push({ kind: "hora", label: range ? `${start}–${end}` : start });
  if (duration && !range) recognized.push({ kind: "duracao", label: duration % 60 ? `${duration} min` : `${duration / 60}h` });
  if (recurrence) recognized.push({ kind: "repeticao", label: recurrence.label });
  if (priority) recognized.push({ kind: "prioridade", label: `P${priority}` });

  return {
    title: cleanTitle(t.rest),
    date: ymd,
    start,
    end,
    allDay: start === null,
    rrule: recurrence?.rrule ?? null,
    priority,
    recognized,
  };
}
