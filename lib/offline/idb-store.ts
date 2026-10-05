"use client";
// Armazenamento da fila offline no IndexedDB (sobrevive a fechar o app). Só no navegador.
import type { QueueEntry, QueueStore } from "./queue";

const DB_NAME = "agenda-offline";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const idbStore: QueueStore = {
  all: () => tx<QueueEntry[]>("readonly", (s) => s.getAll() as IDBRequest<QueueEntry[]>),
  put: async (e) => void (await tx("readwrite", (s) => s.put(e))),
  remove: async (id) => void (await tx("readwrite", (s) => s.delete(id))),
  clear: async () => void (await tx("readwrite", (s) => s.clear())),
};

/** Ao sair da conta: apaga fila e dados guardados para leitura offline (cache do service worker). */
export async function clearOfflineData(): Promise<void> {
  await idbStore.clear().catch(() => undefined);
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("agenda-")).map((k) => caches.delete(k)));
  }
}
