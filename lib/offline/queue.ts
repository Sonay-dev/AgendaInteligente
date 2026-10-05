// Fila de escritas offline (etapa 9): capturas na caixa de entrada e conclusões de tarefa feitas sem conexão
// ficam guardadas no aparelho e são enviadas quando a conexão volta. A lógica é independente do armazenamento
// (IndexedDB no navegador, memória nos testes).

export type QueuedOp =
  | { kind: "inbox.capture"; payload: { id: string; rawText: string; source: "digitado" | "voz" } }
  | { kind: "task.status"; payload: { taskId: string; status: "concluida" | "a_fazer" } };

export type QueueEntry = QueuedOp & { id: string; createdAt: string; attempts: number; lastError?: string };

export interface QueueStore {
  all(): Promise<QueueEntry[]>;
  put(entry: QueueEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Resposta do servidor → o que fazer com o item. Erro de rede (status 0), 408, 429 e 5xx: tentar de novo. */
export function classify(status: number): "done" | "retry" | "drop" {
  if (status >= 200 && status < 300) return "done";
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "retry";
  if (status === 401) return "retry"; // sessão expirada: espera o login, não perde a captura
  return "drop"; // 400/404/409…: não adianta reenviar (ex.: tarefa apagada em outro aparelho)
}

export function requestFor(op: QueuedOp): { url: string; init: RequestInit } {
  const json = (body: unknown, method: string) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (op.kind === "inbox.capture") return { url: "/api/inbox", init: json(op.payload, "POST") };
  return { url: `/api/tasks/${op.payload.taskId}`, init: json({ status: op.payload.status }, "PATCH") };
}

export async function enqueue(store: QueueStore, op: QueuedOp, now = new Date()): Promise<QueueEntry> {
  const all = await store.all();
  // concluir/reabrir a mesma tarefa várias vezes offline: vale só a última intenção
  if (op.kind === "task.status") {
    for (const e of all) if (e.kind === "task.status" && e.payload.taskId === op.payload.taskId) await store.remove(e.id);
  }
  const entry = { ...op, id: crypto.randomUUID(), createdAt: now.toISOString(), attempts: 0 } as QueueEntry;
  await store.put(entry);
  return entry;
}

export interface FlushResult {
  sent: number;
  dropped: QueueEntry[];
  remaining: number;
  offline: boolean; // parou porque a rede/servidor não respondeu
}

/**
 * Envia em ordem de criação. Para no primeiro erro de rede (o resto também falharia);
 * itens recusados pelo servidor (4xx) saem da fila e voltam em `dropped` para avisar o usuário.
 */
export async function flush(store: QueueStore, send: (url: string, init: RequestInit) => Promise<number>): Promise<FlushResult> {
  const entries = (await store.all()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let sent = 0;
  const dropped: QueueEntry[] = [];
  for (const e of entries) {
    const { url, init } = requestFor(e);
    let status = 0;
    try {
      status = await send(url, init);
    } catch {
      status = 0;
    }
    const verdict = classify(status);
    if (verdict === "done") {
      await store.remove(e.id);
      sent++;
    } else if (verdict === "drop") {
      await store.remove(e.id);
      dropped.push({ ...e, lastError: `http_${status}` });
    } else {
      await store.put({ ...e, attempts: e.attempts + 1, lastError: status ? `http_${status}` : "sem_conexao" });
      return { sent, dropped, remaining: (await store.all()).length, offline: true };
    }
  }
  return { sent, dropped, remaining: 0, offline: false };
}

export function memoryStore(initial: QueueEntry[] = []): QueueStore & { entries: Map<string, QueueEntry> } {
  const entries = new Map(initial.map((e) => [e.id, e]));
  return {
    entries,
    all: async () => [...entries.values()],
    put: async (e) => void entries.set(e.id, e),
    remove: async (id) => void entries.delete(id),
    clear: async () => entries.clear(),
  };
}
