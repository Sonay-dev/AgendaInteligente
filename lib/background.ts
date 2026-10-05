import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Executa após a resposta (ctx.waitUntil no Workers). Erros são só registrados. */
export async function runInBackground(task: () => Promise<unknown>): Promise<void> {
  const p = task().catch((e: unknown) => console.error("tarefa em segundo plano falhou", e instanceof Error ? e.name : "erro"));
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(p);
  } catch {
    // fora do Workers (testes): a promise segue sozinha
  }
}
