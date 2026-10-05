import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE, startAuthorization } from "@/lib/google/oauth";
import { getCurrentUser } from "@/lib/session";

// GET /api/google/connect → consentimento do Google (Calendar + Tasks) para o usuário logado.
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const env = await getEnv();
  const { url, cookie } = await startAuthorization(env, user.id);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: env.APP_URL.startsWith("https://"),
    sameSite: "lax", // o retorno do Google é navegação de topo (GET): o cookie vai junto
    path: "/api/google/callback",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  return res;
}
