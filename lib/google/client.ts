import "server-only";
// Cliente HTTP do Google: access_token descriptografado só no servidor, refresh automático,
// retry com backoff exponencial para 429/5xx/rate limit. Nunca registra tokens em log.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { googleConnections } from "@/db/schema";
import { decrypt, encrypt, isEncrypted } from "../crypto";
import type { Env } from "../env";
import { nowIso } from "../time";
import { isRetryableStatus } from "./mapping";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super(`Google API ${status}: ${reason}`);
  }
}

export class GoogleAuthMissing extends Error {
  constructor() {
    super("integração com o Google não conectada");
  }
}

interface Ctx {
  db: Db;
  env: Env;
  userId: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readToken(env: Env, value: string | null): Promise<string | null> {
  if (!value) return null;
  return isEncrypted(value) ? decrypt(value, env.ENCRYPTION_KEY) : value;
}

async function activeConnection(ctx: Ctx) {
  const [conn] = await ctx.db
    .select()
    .from(googleConnections)
    .where(and(eq(googleConnections.userId, ctx.userId), eq(googleConnections.status, "active")));
  return conn ?? null;
}

async function refreshAccessToken(ctx: Ctx, refreshTokenStored: string | null): Promise<string> {
  const refreshToken = await readToken(ctx.env, refreshTokenStored);
  if (!refreshToken) throw new GoogleAuthMissing();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ctx.env.GOOGLE_CLIENT_ID,
      client_secret: ctx.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // invalid_grant = refresh_token revogado/expirado (ex.: app em "Testing" após 7 dias) → pedir reconexão
    if (body.error === "invalid_grant") {
      await ctx.db
        .update(googleConnections)
        .set({ status: "revoked", accessToken: null, updatedAt: nowIso() })
        .where(eq(googleConnections.userId, ctx.userId));
    }
    throw new GoogleApiError(res.status, body.error ?? "refresh_failed");
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  await ctx.db
    .update(googleConnections)
    .set({
      accessToken: await encrypt(tok.access_token, ctx.env.ENCRYPTION_KEY),
      accessTokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      ...(tok.refresh_token ? { refreshToken: await encrypt(tok.refresh_token, ctx.env.ENCRYPTION_KEY) } : {}),
      updatedAt: nowIso(),
    })
    .where(eq(googleConnections.userId, ctx.userId));
  return tok.access_token;
}

export async function getAccessToken(ctx: Ctx, forceRefresh = false): Promise<string> {
  const conn = await activeConnection(ctx);
  if (!conn) throw new GoogleAuthMissing();
  const valid = conn.accessTokenExpiresAt && new Date(conn.accessTokenExpiresAt).getTime() > Date.now() + 60_000;
  if (!forceRefresh && valid) {
    const token = await readToken(ctx.env, conn.accessToken);
    if (token) return token;
  }
  return refreshAccessToken(ctx, conn.refreshToken);
}

/** Integração ativa (conectada e com refresh_token)? */
export async function hasGoogleConnection(ctx: Ctx): Promise<boolean> {
  return !!(await activeConnection(ctx))?.refreshToken;
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; errors?: { reason?: string }[]; status?: string };
}

/**
 * fetch autenticado no Google com:
 * - refresh automático e 1 nova tentativa em 401;
 * - até `retries` tentativas com backoff exponencial (300ms, 600ms, 1.2s…) em 429/5xx/rateLimit.
 */
export async function googleFetch<T>(ctx: Ctx, url: string, init: RequestInit = {}, retries = 3): Promise<T> {
  let token = await getAccessToken(ctx);
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 204) return undefined as T;
    if (res.ok) return (await res.json()) as T;

    const body = (await res.json().catch(() => ({}))) as GoogleErrorBody;
    const reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? `http_${res.status}`;

    if (res.status === 401 && !refreshed) {
      token = await getAccessToken(ctx, true);
      refreshed = true;
      continue;
    }
    const rateLimited = res.status === 403 && /rateLimit|userRateLimit|quotaExceeded/i.test(reason);
    if ((isRetryableStatus(res.status) || rateLimited) && attempt < retries) {
      await sleep(300 * 2 ** attempt + Math.random() * 100);
      continue;
    }
    throw new GoogleApiError(res.status, reason);
  }
}
