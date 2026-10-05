import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../lib/nlp/parse-pt";

const TZ = "America/Sao_Paulo";
// domingo, 4/out/2026, 15:00 em São Paulo
const now = new Date("2026-10-04T18:00:00Z");
const p = (text: string, at: Date = now) => parseQuickAdd(text, at, TZ);

describe("parseQuickAdd — exemplos pedidos", () => {
  it("reunião com João amanhã às 15h por 1h", () => {
    const d = p("reunião com João amanhã às 15h por 1h");
    expect(d).toMatchObject({ title: "Reunião com João", date: "2026-10-05", start: "15:00", end: "16:00", allDay: false, rrule: null });
    expect(d.recognized.map((r) => r.kind)).toEqual(["data", "hora", "duracao"]);
  });

  it("academia seg, qua e sex 6h → recorrência semanal", () => {
    const d = p("academia seg, qua e sex 6h");
    expect(d).toMatchObject({ title: "Academia", start: "06:00", end: "07:00", rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
    expect(d.date).toBe("2026-10-05"); // primeira ocorrência: segunda
  });
});

describe("parseQuickAdd — horas e durações", () => {
  it.each([
    ["dentista às 9:30", "09:30", "10:30"],
    ["almoço 12h30", "12:30", "13:30"],
    ["treino às 6", "06:00", "07:00"],
    ["jantar às 8 da noite", "20:00", "21:00"],
    ["call 15 horas por 30 min", "15:00", "15:30"],
    ["workshop 9h por 2h30", "09:00", "11:30"],
    ["reunião das 14h às 16h", "14:00", "16:00"],
    ["aula 19h-21h", "19:00", "21:00"],
    ["almoço ao meio-dia por meia hora", "12:00", "12:30"],
    ["planejamento 10h por duas horas", "10:00", "12:00"],
  ])("%s", (text, start, end) => {
    expect(p(text)).toMatchObject({ start, end, allDay: false });
  });

  it("sem hora → dia inteiro", () => {
    expect(p("pagar boleto hoje")).toMatchObject({ title: "Pagar boleto", date: "2026-10-04", allDay: true, start: null });
  });

  it("sem data → hoje", () => {
    expect(p("ligar para o banco 16h")).toMatchObject({ title: "Ligar para o banco", date: "2026-10-04", start: "16:00" });
  });
});

describe("parseQuickAdd — datas", () => {
  it.each([
    ["jantar depois de amanhã às 20h", "2026-10-06"],
    ["call na próxima terça às 10", "2026-10-06"],
    ["reunião segunda que vem 8h", "2026-10-05"],
    ["almoço sexta 12h", "2026-10-09"],
    ["dentista dia 12 às 9h", "2026-10-12"],
    ["aluguel dia 2", "2026-11-02"], // dia 2 já passou → próximo mês
    ["consulta 15/10 14h", "2026-10-15"],
    ["evento 10 de novembro", "2026-11-10"],
    ["revisão daqui a 3 dias", "2026-10-07"],
  ])("%s → %s", (text, date) => {
    expect(p(text).date).toBe(date);
  });

  it("domingo dito no próprio domingo é hoje; 'próximo domingo' é a semana seguinte", () => {
    expect(p("missa domingo 18h").date).toBe("2026-10-04");
    expect(p("missa próximo domingo 18h").date).toBe("2026-10-11");
  });

  it("limpa conectores do título", () => {
    expect(p("consulta no dia 15/10 às 14h").title).toBe("Consulta");
    expect(p("café com a Ana na sexta às 9h").title).toBe("Café com a Ana");
  });
});

describe("parseQuickAdd — recorrência e prioridade", () => {
  it.each([
    ["inglês toda terça 19h", "FREQ=WEEKLY;BYDAY=TU", "2026-10-06"],
    ["corrida às terças e quintas 7h", "FREQ=WEEKLY;BYDAY=TU,TH", "2026-10-06"],
    ["stand-up dias úteis 9h por 15 min", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-10-05"],
    ["remédio todo dia 8h", "FREQ=DAILY", "2026-10-04"],
    ["pagar cartão todo dia 10", "FREQ=MONTHLY;BYMONTHDAY=10", "2026-10-10"],
    ["fechamento todo mês", "FREQ=MONTHLY", "2026-10-04"],
  ])("%s", (text, rrule, date) => {
    expect(p(text)).toMatchObject({ rrule, date });
  });

  it("série cujo horário de hoje já passou começa na próxima ocorrência", () => {
    // domingo 15h: "domingos 10h" já passou hoje → próximo domingo
    expect(p("feira aos domingos 10h")).toMatchObject({ date: "2026-10-11", rrule: "FREQ=WEEKLY;BYDAY=SU" });
  });

  it("prioridade por palavra-chave", () => {
    expect(p("enviar proposta urgente amanhã 9h")).toMatchObject({ title: "Enviar proposta", priority: 1 });
    expect(p("revisar contrato importante")).toMatchObject({ title: "Revisar contrato", priority: 2 });
    expect(p("ler livro").priority).toBeNull();
  });
});
