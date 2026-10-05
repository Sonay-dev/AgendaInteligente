import "server-only";
// OAuth 2.0 do Google só para a INTEGRAÇÃO (Calendar + Tasks). O login do app é e-mail + senha.
// Fluxo: /api/google/connect → Google → /api/google/callback (state + PKCE em cookie httpOnly).
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, events, googleConnections, syncState } from "@/db/schema";
import { bytesToB64url, decrypt, encrypt, isEncrypted, randomToken } from "../crypto";
import type { Env } from "../env";
import { nowIso } from "../time";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks",
];

export const OAUTH_COOKIE = "agenda.google_oauth";
export const OAUTH_COOKIE_MAX_AGE = 10 * 60;

export function callbackUrl(env: Pick<Env, "APP_URL">): string {
  return new URL("/api/google/callback", env.APP_URL).toString();
}

async function sha256B64url(text: string): Promise<string> {
  return bytesToB64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

/** Monta a URL de consentimento e o valor do cookie (state + code_verifier, ligados ao usuário). */
export async function startAuthorization(env: Env, userId: string): Promise<{ url: string; cookie: string }> {
  const state = randomToken();
  const verifier = randomToken(48);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(env),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // garante refresh_token
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    code_challenge: await sha256B64url(verifier),
    code_challenge_method: "S256",
  });
  // cookie criptografado: o code_verifier não fica legível nem no navegador
  const cookie = await encrypt(JSON.stringify({ state, verifier, userId }), env.ENCRYPTION_KEY);
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, cookie };
}

export async function readOAuthCookie(env: Env, value: string | undefined): Promise<{ state: string; verifier: string; userId: string } | null> {
  if (!value || !isEncrypted(value)) return null;
  try {
    return JSON.parse(await decrypt(value, env.ENCRYPTION_KEY));
  } catch {
    return null;
  }
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export class OAuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Troca o code pelos tokens e lê sub/e-mail do id_token (veio direto do Google via TLS). */
export async function exchangeCode(env: Env, code: string, verifier: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(env),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new OAuthError(body.error ?? `token_${res.status}`);
  }
  const tok = (await res.json()) as TokenResponse;
  const claims = decodeJwtPayload(tok.id_token);
  if (!claims?.sub || !claims.email) throw new OAuthError("sem_id_token");
  return { tokens: tok, sub: claims.sub, email: claims.email };
}

function decodeJwtPayload(jwt: string | undefined): { sub?: string; email?: string } | null {
  const part = jwt?.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function hasRequiredScopes(scope: string | undefined): boolean {
  const granted = new Set((scope ?? "").split(" "));
  return GOOGLE_SCOPES.filter((s) => s.startsWith("https://")).every((s) => granted.has(s));
}

/**
 * Grava (ou substitui) a conexão do usuário com tokens criptografados.
 * Se a conta Google mudou, desfaz os vínculos antigos: tudo volta a "pending" e vai para a conta nova.
 */
export async function saveConnection(db: Db, env: Env, userId: string, data: Awaited<ReturnType<typeof exchangeCode>>) {
  const { tokens, sub, email } = data;
  const [prev] = await db.select().from(googleConnections).where(eq(googleConnections.userId, userId));
  const sameAccount = prev?.googleSub === sub;
  const refreshToken = tokens.refresh_token
    ? await encrypt(tokens.refresh_token, env.ENCRYPTION_KEY)
    : sameAccount && prev.status === "active"
      ? prev.refreshToken
      : null;
  if (!refreshToken) throw new OAuthError("sem_refresh_token");

  const values = {
    googleSub: sub,
    googleEmail: email,
    accessToken: await encrypt(tokens.access_token, env.ENCRYPTION_KEY),
    refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? null,
    status: "active" as const,
    connectedAt: nowIso(),
    updatedAt: nowIso(),
  };
  const switched = !!prev && !sameAccount;
  await db.batch([
    db.insert(googleConnections).values({ userId, ...values }).onConflictDoUpdate({ target: googleConnections.userId, set: values }),
    ...(switched
      ? [
          db.delete(syncState).where(eq(syncState.userId, userId)),
          db
            .update(events)
            .set({ googleEventId: null, googleEtag: null, googleUpdatedAt: null, syncStatus: "pending", syncAttempts: 0, syncError: null, nextRetryAt: null })
            .where(and(eq(events.userId, userId), isNull(events.deletedAt))),
        ]
      : [
          // erros de "não conectado" voltam para a fila imediatamente
          db
            .update(events)
            .set({ syncStatus: "pending", syncAttempts: 0, nextRetryAt: null })
            .where(and(eq(events.userId, userId), inArray(events.syncStatus, ["pending", "error"]))),
        ]),
    db.insert(auditLog).values({ userId, entity: "sync", action: "google_connected", source: "app", detail: { googleEmail: email, switchedAccount: switched } }),
  ]);
}

export async function getConnection(db: Db, userId: string) {
  const [conn] = await db.select().from(googleConnections).where(eq(googleConnections.userId, userId));
  return conn ?? null;
}

/**
 * Desconecta: revoga o token no Google (melhor esforço), apaga os tokens e o estado de sync.
 * Os eventos locais ficam, com os vínculos (google_event_id) — úteis se reconectar a mesma conta.
 */
export async function disconnect(db: Db, env: Env, userId: string): Promise<boolean> {
  const conn = await getConnection(db, userId);
  if (!conn || conn.status === "disconnected") return false;
  const token = conn.refreshToken ? await decrypt(conn.refreshToken, env.ENCRYPTION_KEY).catch(() => null) : null;
  if (token) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => undefined);
  }
  await db.batch([
    db
      .update(googleConnections)
      .set({ status: "disconnected", accessToken: null, refreshToken: null, accessTokenExpiresAt: null, updatedAt: nowIso() })
      .where(eq(googleConnections.userId, userId)),
    db.delete(syncState).where(eq(syncState.userId, userId)),
    db.insert(auditLog).values({ userId, entity: "sync", action: "google_disconnected", source: "app", detail: { googleEmail: conn.googleEmail } }),
  ]);
  return true;
}
