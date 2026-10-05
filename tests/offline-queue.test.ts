import { describe, expect, it } from "vitest";
import { classify, enqueue, flush, memoryStore, requestFor } from "../lib/offline/queue";

const capture = (rawText: string) => ({ kind: "inbox.capture" as const, payload: { id: crypto.randomUUID(), rawText, source: "digitado" as const } });
const complete = (taskId: string, status: "concluida" | "a_fazer" = "concluida") => ({ kind: "task.status" as const, payload: { taskId, status } });

describe("fila offline — classificação da resposta", () => {
  it("2xx envia; rede/servidor/429/401 tenta de novo; 4xx descarta", () => {
    expect([200, 201, 204].map(classify)).toEqual(["done", "done", "done"]);
    expect([0, 408, 429, 500, 503, 401].map(classify)).toEqual(["retry", "retry", "retry", "retry", "retry", "retry"]);
    expect([400, 404, 409].map(classify)).toEqual(["drop", "drop", "drop"]);
  });

  it("monta as requisições certas", () => {
    const c = capture("ligar pro banco");
    expect(requestFor(c)).toMatchObject({ url: "/api/inbox", init: { method: "POST" } });
    expect(JSON.parse(requestFor(c).init.body as string)).toEqual(c.payload); // inclui o id → reenvio idempotente
    expect(requestFor(complete("t1"))).toMatchObject({ url: "/api/tasks/t1", init: { method: "PATCH", body: '{"status":"concluida"}' } });
  });
});

describe("fila offline — envio", () => {
  it("envia em ordem de criação e esvazia a fila", async () => {
    const store = memoryStore();
    await enqueue(store, capture("primeiro"), new Date("2026-10-05T10:00:00Z"));
    await enqueue(store, capture("segundo"), new Date("2026-10-05T10:01:00Z"));
    const seen: string[] = [];
    const r = await flush(store, async (_url, init) => {
      seen.push(JSON.parse(init.body as string).rawText);
      return 201;
    });
    expect(seen).toEqual(["primeiro", "segundo"]);
    expect(r).toEqual({ sent: 2, dropped: [], remaining: 0, offline: false });
    expect(store.entries.size).toBe(0);
  });

  it("sem conexão: para no primeiro erro, mantém tudo e conta a tentativa", async () => {
    const store = memoryStore();
    await enqueue(store, capture("a"), new Date("2026-10-05T10:00:00Z"));
    await enqueue(store, capture("b"), new Date("2026-10-05T10:01:00Z"));
    let calls = 0;
    const r = await flush(store, async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    });
    expect(calls).toBe(1);
    expect(r).toMatchObject({ sent: 0, remaining: 2, offline: true });
    expect([...store.entries.values()].map((e) => e.attempts).sort()).toEqual([0, 1]);
  });

  it("recusado pelo servidor (404): sai da fila e é reportado; o resto continua", async () => {
    const store = memoryStore();
    await enqueue(store, complete("apagada"), new Date("2026-10-05T10:00:00Z"));
    await enqueue(store, capture("ok"), new Date("2026-10-05T10:01:00Z"));
    const r = await flush(store, async (url) => (url.includes("apagada") ? 404 : 201));
    expect(r.sent).toBe(1);
    expect(r.dropped.map((d) => d.lastError)).toEqual(["http_404"]);
    expect(store.entries.size).toBe(0);
  });

  it("concluir e reabrir a mesma tarefa offline: vale só a última intenção", async () => {
    const store = memoryStore();
    await enqueue(store, complete("t1", "concluida"));
    await enqueue(store, complete("t2", "concluida"));
    await enqueue(store, complete("t1", "a_fazer"));
    const ops = [...store.entries.values()].map((e) => (e.kind === "task.status" ? `${e.payload.taskId}:${e.payload.status}` : ""));
    expect(ops.sort()).toEqual(["t1:a_fazer", "t2:concluida"]);
  });
});
