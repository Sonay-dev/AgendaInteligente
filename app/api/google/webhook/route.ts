import { getDb } from "@/db";
import { runInBackground } from "@/lib/background";
import { safeEqual } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { findChannel, pullCalendar } from "@/lib/google/calendar-sync";

// Notificações do events.watch. O Google só manda cabeçalhos; buscamos as mudanças com syncToken.
export async function POST(req: Request): Promise<Response> {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token") ?? "";
  const resourceId = req.headers.get("x-goog-resource-id");
  const state = req.headers.get("x-goog-resource-state");
  if (!channelId) return new Response(null, { status: 400 });

  const db = await getDb();
  const channel = await findChannel(db, channelId);
  // canal desconhecido/antigo: 200 para o Google não insistir; ele expira sozinho
  if (!channel || !channel.channelToken || !safeEqual(channel.channelToken, token) || channel.resourceId !== resourceId) {
    return new Response(null, { status: 200 });
  }
  if (state === "sync") return new Response(null, { status: 200 }); // handshake inicial

  const env = await getEnv();
  await runInBackground(() => pullCalendar({ db, env, userId: channel.userId }));
  return new Response(null, { status: 200 });
}
