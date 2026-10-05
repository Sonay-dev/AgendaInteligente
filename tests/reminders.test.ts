import { describe, expect, it } from "vitest";
import { dueNow, eventSlots, taskSlots, type EventOccurrenceInput, type TaskInput } from "../lib/reminders/schedule";
import { DEFAULT_REMINDERS } from "../lib/validation";

const TZ = "America/Sao_Paulo";
const sp = (s: string) => new Date(`${s}-03:00`).toISOString(); // horário de São Paulo → ISO UTC

const ev = (extra: Partial<EventOccurrenceInput> = {}): EventOccurrenceInput => ({
  id: "e1",
  title: "Reunião com João",
  location: null,
  allDay: false,
  priority: 3,
  status: "confirmado",
  occurrenceStart: sp("2026-10-06T15:00:00"),
  occurrenceEnd: sp("2026-10-06T16:00:00"),
  reminders: [10],
  ...extra,
});

const task = (extra: Partial<TaskInput> = {}): TaskInput => ({
  id: "t1",
  title: "Enviar proposta",
  dueAt: sp("2026-10-06T09:00:00"),
  dueAllDay: false,
  priority: 3,
  status: "a_fazer",
  ...extra,
});

describe("compromissos", () => {
  it("escalonamento padrão por prioridade (P1 = 3 avisos, P2 = 2, P3 = 1)", () => {
    for (const [p, n] of [[1, 3], [2, 2], [3, 1]] as const) {
      const mins = DEFAULT_REMINDERS[p]!.map((r) => r.minutesBefore);
      expect(eventSlots(ev({ priority: p, reminders: mins }), TZ)).toHaveLength(n);
    }
  });

  it("horários e textos dos avisos", () => {
    const slots = eventSlots(ev({ reminders: [1440, 60, 10], location: "Sala 2" }), TZ);
    expect(slots.map((s) => [s.fireAt, s.body])).toEqual([
      [sp("2026-10-05T15:00:00"), "Amanhã · 15:00–16:00 · Sala 2"],
      [sp("2026-10-06T14:00:00"), "Em 1h · 15:00–16:00 · Sala 2"],
      [sp("2026-10-06T14:50:00"), "Em 10 min · 15:00–16:00 · Sala 2"],
    ]);
    expect(slots[0]!.url).toBe("/agenda?v=dia&d=2026-10-06");
  });

  it("dia inteiro: 08:00 do dia; P1 também na véspera às 18:00", () => {
    const base = { allDay: true, occurrenceStart: sp("2026-10-06T00:00:00"), occurrenceEnd: sp("2026-10-07T00:00:00") };
    expect(eventSlots(ev({ ...base, priority: 3 }), TZ).map((s) => s.fireAt)).toEqual([sp("2026-10-06T08:00:00")]);
    expect(eventSlots(ev({ ...base, priority: 1 }), TZ).map((s) => s.fireAt)).toEqual([sp("2026-10-06T08:00:00"), sp("2026-10-05T18:00:00")]);
  });

  it("concluídos e cancelados não avisam; chaves diferentes por ocorrência", () => {
    expect(eventSlots(ev({ status: "concluido" }), TZ)).toEqual([]);
    expect(eventSlots(ev({ status: "cancelado" }), TZ)).toEqual([]);
    const a = eventSlots(ev(), TZ)[0]!.key;
    const b = eventSlots(ev({ occurrenceStart: sp("2026-10-13T15:00:00"), occurrenceEnd: sp("2026-10-13T16:00:00") }), TZ)[0]!.key;
    expect(a).not.toBe(b);
  });
});

describe("tarefas (escalonamento)", () => {
  it("P1 com hora: véspera, 1h, 10 min, no prazo e 7 cobranças diárias", () => {
    const s = taskSlots(task({ priority: 1 }), TZ);
    expect(s.map((x) => x.body).slice(0, 4)).toEqual(["Vence amanhã às 09:00", "Vence em 1h (09:00)", "Vence em 10 min (09:00)", "Venceu agora (09:00)"]);
    const nags = s.filter((x) => x.key.includes(":atraso"));
    expect(nags).toHaveLength(7);
    expect(nags[0]!.fireAt).toBe(sp("2026-10-07T08:00:00"));
    expect(nags[6]!.body).toBe("Atrasada há 7 dias");
  });

  it("P2: 1h, 10 min, no prazo e uma cobrança; P3: só 10 min antes", () => {
    expect(taskSlots(task({ priority: 2 }), TZ).map((x) => x.key.split(":").pop())).toEqual(["60", "10", "0", "atraso1"]);
    expect(taskSlots(task({ priority: 3 }), TZ).map((x) => x.key.split(":").pop())).toEqual(["10"]);
  });

  it("dia inteiro: 08:00 do dia (P1 também véspera 18:00)", () => {
    const d = { dueAt: sp("2026-10-06T00:00:00"), dueAllDay: true };
    expect(taskSlots(task({ ...d, priority: 3 }), TZ).map((x) => [x.fireAt, x.body])).toEqual([[sp("2026-10-06T08:00:00"), "Vence hoje"]]);
    expect(taskSlots(task({ ...d, priority: 1 }), TZ)[0]).toMatchObject({ fireAt: sp("2026-10-05T18:00:00"), body: "Vence amanhã" });
  });

  it("sem prazo ou concluída: nada; mudar o prazo gera chaves novas", () => {
    expect(taskSlots(task({ dueAt: null }), TZ)).toEqual([]);
    expect(taskSlots(task({ status: "concluida" }), TZ)).toEqual([]);
    const k1 = taskSlots(task(), TZ)[0]!.key;
    const k2 = taskSlots(task({ dueAt: sp("2026-10-07T09:00:00") }), TZ)[0]!.key;
    expect(k1).not.toBe(k2);
  });
});

describe("dueNow", () => {
  const slots = eventSlots(ev({ reminders: [60, 10] }), TZ); // 14:00 e 14:50

  it("envia dentro da janela (até 2,5 min antes, até 30 min depois)", () => {
    expect(dueNow(slots, new Date(sp("2026-10-06T14:48:00"))).send.map((s) => s.body)).toEqual(["Em 10 min · 15:00–16:00"]);
    expect(dueNow(slots, new Date(sp("2026-10-06T14:46:00"))).send).toEqual([]);
    expect(dueNow(slots, new Date(sp("2026-10-06T14:30:00"))).send).toEqual([]); // 14:00 já passou há 30 min
  });

  it("cron atrasado: só o aviso mais recente do item; os antigos ficam como 'superados'", () => {
    const two = eventSlots(ev({ reminders: [20, 10] }), TZ); // 14:40 e 14:50
    const r = dueNow(two, new Date(sp("2026-10-06T14:51:00")));
    expect(r.send.map((s) => s.key.split(":").pop())).toEqual(["10"]);
    expect(r.superseded.map((s) => s.key.split(":").pop())).toEqual(["20"]);
  });

  it("P1 primeiro quando vários itens vencem juntos", () => {
    const now = new Date(sp("2026-10-06T08:50:00"));
    const all = [...taskSlots(task({ id: "a", priority: 3 }), TZ), ...taskSlots(task({ id: "b", priority: 1 }), TZ)];
    expect(dueNow(all, now).send.map((s) => s.itemId)).toEqual(["b", "a"]);
  });
});
