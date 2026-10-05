// Hash de senha com PBKDF2-SHA256 via Web Crypto (o scrypt padrão do Better Auth é pesado demais
// para a CPU do Workers). O Workers aceita no máximo 100 000 iterações.
// Formato: "pbkdf2:sha256:<iterações>:<salt base64url>:<hash base64url>".
import { b64ToBytes, bytesToB64url, safeEqual } from "./crypto";

const ITERATIONS = 100_000;
const KEY_BITS = 256;

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BITS);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2:sha256:${ITERATIONS}:${bytesToB64url(salt)}:${bytesToB64url(hash)}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [scheme, algo, iter, saltB64, hashB64] = hash.split(":");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2" || algo !== "sha256" || !saltB64 || !hashB64 || !Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) {
    return false;
  }
  const actual = await derive(password, b64ToBytes(saltB64), iterations);
  return safeEqual(bytesToB64url(actual), hashB64);
}
