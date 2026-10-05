// Token das ações da notificação ("Concluir" / "Adiar"): HMAC-SHA256 com AUTH_SECRET.
// O service worker o envia de volta; assim a ação funciona mesmo com a sessão expirada,
// mas só vale para aquele item e expira (padrão: 3 dias).
import { b64ToBytes, bytesToB64url, safeEqual } from "../crypto";

export interface ActionClaims {
  u: string; // userId
  t: "event" | "task";
  id: string;
  occ: string | null; // ocorrência (série recorrente)
  rec: boolean; // série recorrente → "Concluir" não se aplica
  exp: number; // epoch s
}

const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(`push-action:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keys.set(secret, k);
  }
  return k;
}

async function sign(data: string, secret: string): Promise<string> {
  return bytesToB64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data))));
}

export async function createActionToken(claims: Omit<ActionClaims, "exp">, secret: string, ttlSeconds = 3 * 86400, now = Date.now()): Promise<string> {
  const payload = bytesToB64url(enc.encode(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + ttlSeconds })));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyActionToken(token: string, secret: string, now = Date.now()): Promise<ActionClaims | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, await sign(payload, secret))) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64ToBytes(payload))) as ActionClaims;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < now) return null;
    if (claims.t !== "event" && claims.t !== "task") return null;
    return claims;
  } catch {
    return null;
  }
}
