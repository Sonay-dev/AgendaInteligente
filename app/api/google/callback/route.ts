import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { runInBackground } from "@/lib/background";
import { safeEqual } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { ensureWatch, pullCalendar, pushPending } from "@/lib/google/calendar-sync";
import { OAUTH_COOKIE, OAuthError, exchangeCode, hasRequiredScopes, readOAuthCookie, saveConnection } from "@/lib/google/oauth";
import { getCurrentUser } from "@/lib/session";

// GET /api/google/callback?code&state → valida state/PKCE, guarda os tokens criptografados e dispara o 1º sync.
export async function GET(req: NextRequest): Promise<Response> {
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(new URL(`/configuracoes?${new URLSearchParams(params)}`, req.url));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google/callback" });
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const env = await getEnv();
  const q = req.nextUrl.searchParams;
  const saved = await readOAuthCookie(env, req.cookies.get(OAUTH_COOKIE)?.value);
  const state = q.get("state") ?? "";
  if (!saved || saved.userId !== user.id || !safeEqual(saved.state, state)) return back({ google_erro: "state_invalido" });
  if (q.get("error")) return back({ google_erro: q.get("error") === "access_denied" ? "cancelado" : "google_recusou" });
  const code = q.get("code");
  if (!code) return back({ google_erro: "sem_codigo" });

  const db = await getDb();
  try {
    const data = await exchangeCode(env, code, saved.verifier);
    if (!hasRequiredScopes(data.tokens.scope)) return back({ google_erro: "permissoes_incompletas" });
    await saveConnection(db, env, user.id, data);
  } catch (e) {
    return back({ google_erro: e instanceof OAuthError ? e.code : "falha_conexao" });
  }

  const ctx = { db, env, userId: user.id };
  await runInBackground(async () => {
    await pushPending(ctx, 6);
    await pullCalendar(ctx);
    await ensureWatch(ctx);
  });
  return back({ google: "conectado" });
}
