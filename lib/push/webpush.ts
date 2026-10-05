// Web Push só com Web Crypto (roda no Workers; a lib `web-push` depende do crypto do Node).
// - Conteúdo criptografado com "aes128gcm" (RFC 8291 + RFC 8188).
// - Autenticação do servidor com VAPID (RFC 8292): JWT ES256 no cabeçalho Authorization.
import { b64ToBytes, bytesToB64url } from "../crypto";

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string; // chave pública do navegador (65 bytes, base64url)
  auth: string; // segredo de autenticação (16 bytes, base64url)
}

export interface VapidConfig {
  publicKey: string; // base64url, ponto P-256 não comprimido (65 bytes)
  privateKey: string; // base64url, escalar "d" (32 bytes)
  subject: string; // mailto: ou https:
}

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// ------------------------------------------------------------------ criptografia (RFC 8291)
export interface EncryptOptions {
  /** Só para testes: salt e par efêmero fixos. */
  salt?: Bytes;
  localKeys?: CryptoKeyPair;
}

export async function encryptPayload(payload: Uint8Array, sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">, opts: EncryptOptions = {}): Promise<Bytes> {
  const uaPublic = b64ToBytes(sub.p256dh);
  const authSecret = b64ToBytes(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("assinatura de push inválida");

  const local = opts.localKeys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // registro único: conteúdo + delimitador 0x02 (último registro), sem padding extra
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096); // rs
  header[20] = asPublic.length; // idlen
  header.set(asPublic, 21); // keyid = chave pública efêmera
  return concat(header, cipher);
}

// ------------------------------------------------------------------ VAPID (RFC 8292)
const signingKeys = new Map<string, Promise<CryptoKey>>();

function importVapidPrivate(cfg: VapidConfig): Promise<CryptoKey> {
  let p = signingKeys.get(cfg.privateKey);
  if (!p) {
    const pub = b64ToBytes(cfg.publicKey);
    if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY inválida");
    p = crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33)), d: cfg.privateKey, ext: false },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    signingKeys.set(cfg.privateKey, p);
  }
  return p;
}

export async function vapidAuthorization(endpoint: string, cfg: VapidConfig, now = Date.now()): Promise<string> {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: cfg.subject })),
  );
  const unsigned = `${header}.${claims}`;
  // Web Crypto já devolve a assinatura no formato do JWS (r || s, 64 bytes)
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await importVapidPrivate(cfg), enc.encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${cfg.publicKey}`;
}

// ------------------------------------------------------------------ envio
export type PushOutcome = "ok" | "gone" | "error";

export async function sendWebPush(
  sub: PushSubscriptionKeys,
  message: unknown,
  cfg: VapidConfig,
  opts: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {},
): Promise<{ outcome: PushOutcome; status: number }> {
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, cfg),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttlSeconds ?? 3600),
      Urgency: opts.urgency ?? "normal",
      // Topic substitui uma notificação pendente com o mesmo tópico (máx. 32 chars base64url)
      ...(opts.topic ? { Topic: opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
    },
    body,
  });
  // 404/410: a assinatura expirou ou foi cancelada → apagar
  if (res.status === 404 || res.status === 410) return { outcome: "gone", status: res.status };
  return { outcome: res.ok ? "ok" : "error", status: res.status };
}
