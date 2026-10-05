import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../lib/nlp/parse-pt";
import { bucketOf, daysWaiting, draftToTask, dueToIso, groupTasks, isOverdue, statusSideEffects, type TaskLike } from "../lib/tasks-logic";

const TZ = "America/Sao_Paulo";
const now = new Date("2026-10-05T13:00:00Z"); // segunda 10:00 em SP
const t = (extra: Partial<TaskLike>): TaskLike => ({ dueAt: null, dueAllDay: true, status: "a_fazer", priority: 3, ...extra });

describe("isOverdue", () => {
  it("dia inteiro só atrasa depois que o dia acaba (no fuso do usuário)", () => {
    expect(isOverdue(t({ dueAt: dueToIso("2026-10-05", null, TZ) }), now, TZ)).toBe(false); // hoje
    expect(isOverdue(t({ dueAt: dueToIso("2026-10-04", null, TZ) }), now, TZ)).toBe(true); // ontem
  });

  it("com hora: atrasa quando passa do horário", () => {
    expect(isOverdue(t({ dueAt: dueToIso("2026-10-05", "09:00", TZ), dueAllDay: false }), now, TZ)).toBe(true);
    expect(isOverdue(t({ dueAt: dueToIso("2026-10-05", "11:00", TZ), dueAllDay: false }), now, TZ)).toBe(false);
  });

  it("concluída ou sem prazo nunca está atrasada", () => {
    expect(isOverdue(t({ dueAt: dueToIso("2026-10-01", null, TZ), status: "concluida" }), now, TZ)).toBe(false);
    expect(isOverdue(t({}), now, TZ)).toBe(false);
  });

  it("perto da meia-noite usa o dia de São Paulo, não o de UTC", () => {
    // domingo 23:30 em SP = segunda 02:30 UTC; prazo "domingo" ainda não venceu
    const lateSunday = new Date("2026-10-05T02:30:00Z");
    expect(isOverdue(t({ dueAt: dueToIso("2026-10-04", null, TZ) }), lateSunday, TZ)).toBe(false);
  });
});

describe("agrupamento", () => {
  it("separa em atrasadas, hoje, amanhã, 7 dias, depois e sem data", () => {
    const items = [
      t({ dueAt: dueToIso("2026-10-03", null, TZ) }),
      t({ dueAt: dueToIso("2026-10-05", null, TZ) }),
      t({ dueAt: dueToIso("2026-10-06", null, TZ) }),
      t({ dueAt: dueToIso("2026-10-10", null, TZ) }),
      t({ dueAt: dueToIso("2026-11-20", null, TZ) }),
      t({}),
    ];
    expect(items.map((i) => bucketOf(i, now, TZ))).toEqual(["atrasadas", "hoje", "amanha", "semana", "depois", "sem_data"]);
  });

  it("ordena por prioridade e depois por prazo", () => {
    const groups = groupTasks(
      [
        t({ priority: 3, dueAt: dueToIso("2026-10-05", "08:00", TZ), dueAllDay: false }),
        t({ priority: 1, dueAt: dueToIso("2026-10-05", "18:00", TZ), dueAllDay: false }),
        t({ priority: 3, dueAt: dueToIso("2026-10-05", null, TZ) }),
      ],
      new Date("2026-10-05T10:00:00Z"),
      TZ,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.priority)).toEqual([1, 3, 3]);
  });
});

describe("statusSideEffects", () => {
  const base = { status: "a_fazer" as const, waitingSince: null, completedAt: null };
  const at = "2026-10-05T13:00:00.000Z";

  it("entrar em 'aguardando' marca desde quando; sair limpa", () => {
    expect(statusSideEffects(base, "aguardando", at)).toEqual({ waitingSince: at, completedAt: null });
    expect(statusSideEffects({ ...base, status: "aguardando", waitingSince: "2026-10-01T00:00:00.000Z" }, "em_andamento", at)).toEqual({ waitingSince: null, completedAt: null });
  });

  it("concluir registra a data; reabrir limpa", () => {
    expect(statusSideEffects(base, "concluida", at).completedAt).toBe(at);
    expect(statusSideEffects({ ...base, status: "concluida", completedAt: at }, "a_fazer", at).completedAt).toBeNull();
  });

  it("mesmo status não altera nada", () => {
    const cur = { status: "aguardando" as const, waitingSince: "2026-09-01T00:00:00.000Z", completedAt: null };
    expect(statusSideEffects(cur, "aguardando", at)).toEqual({ waitingSince: cur.waitingSince, completedAt: null });
  });
});

describe("daysWaiting", () => {
  it("conta a partir do último contato ou do início da espera", () => {
    expect(daysWaiting(t({ status: "aguardando", waitingSince: "2026-09-30T15:00:00Z" }), now, TZ)).toBe(5);
    expect(daysWaiting(t({ status: "aguardando", waitingSince: "2026-09-30T15:00:00Z", lastContactAt: "2026-10-04T15:00:00Z" }), now, TZ)).toBe(1);
    expect(daysWaiting(t({}), now, TZ)).toBeNull();
  });
});

describe("draftToTask (triagem)", () => {
  it("usa data/hora/prioridade reconhecidas", () => {
    const d = draftToTask(parseQuickAdd("enviar proposta urgente amanhã 9h", now, TZ), "x");
    expect(d).toEqual({ title: "Enviar proposta", dueDate: "2026-10-06", dueTime: "09:00", priority: 1 });
  });

  it("sem data reconhecida → sem prazo (não inventa 'hoje')", () => {
    expect(draftToTask(parseQuickAdd("comprar presente da Ana", now, TZ), "comprar presente da Ana")).toEqual({
      title: "Comprar presente da Ana",
      dueDate: null,
      dueTime: null,
      priority: 3,
    });
  });
});
