// AES-256-GCM com Web Crypto (roda no Workers e no Node 22+).
// Formato armazenado: "enc:v1:<iv base64url>:<ciphertext base64url>".

const PREFIX = "enc:v1:";
const keyCache = new Map<string, Promise<CryptoKey>>();

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function importKey(secretB64: string): Promise<CryptoKey> {
  let p = keyCache.get(secretB64);
  if (!p) {
    const raw = b64ToBytes(secretB64);
    if (raw.length !== 32) throw new Error("ENCRYPTION_KEY deve ter 32 bytes em base64");
    p = crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    keyCache.set(secretB64, p);
  }
  return p;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export async function encrypt(plain: string, secretB64: string): Promise<string> {
  const key = await importKey(secretB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `${PREFIX}${bytesToB64url(iv)}:${bytesToB64url(new Uint8Array(ct))}`;
}

export async function decrypt(stored: string, secretB64: string): Promise<string> {
  if (!isEncrypted(stored)) throw new Error("valor não está criptografado");
  const [ivPart, ctPart] = stored.slice(PREFIX.length).split(":");
  if (!ivPart || !ctPart) throw new Error("formato criptografado inválido");
  const key = await importKey(secretB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(ivPart) }, key, b64ToBytes(ctPart));
  return new TextDecoder().decode(pt);
}

/** Criptografa só se houver valor e ainda não estiver criptografado. */
export async function encryptMaybe(value: string | null | undefined, secretB64: string): Promise<string | null | undefined> {
  if (!value || isEncrypted(value)) return value;
  return encrypt(value, secretB64);
}

/** Token aleatório (base64url) para canais do Google, etc. */
export function randomToken(bytes = 24): string {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Comparação em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
