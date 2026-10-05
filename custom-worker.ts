// Worker de entrada: reaproveita o fetch gerado pelo OpenNext e acrescenta o
// handler `scheduled` do Cron Trigger, que chama a rota interna /api/cron.
// Compilado pelo wrangler (fora do tsconfig, pois .open-next só existe após o build).
// @ts-expect-error -- gerado por `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

const worker = {
  fetch: handler.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const req = new Request(new URL("/api/cron", env.APP_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET}`, "x-cron": controller.cron },
    });
    ctx.waitUntil(
      Promise.resolve(handler.fetch(req, env, ctx)).then(async (res: Response) => {
        if (!res.ok) console.error("cron falhou", res.status);
      }),
    );
  },
};

export default worker;
