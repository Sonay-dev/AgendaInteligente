import { describe, expect, it } from "vitest";
import { b64ToBytes, bytesToB64url } from "../lib/crypto";
import { encryptPayload, vapidAuthorization } from "../lib/push/webpush";

const enc = new TextEncoder();

async function ecdhPairFromRaw(pubB64: string, dB64: string): Promise<CryptoKeyPair> {
  const pub = b64ToBytes(pubB64);
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33)) };
  return {
    publicKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []),
    privateKey: await crypto.subtle.importKey("jwk", { ...jwk, d: dB64 }, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
  };
}

/** Decifra como o navegador faria (RFC 8291 §3.4) — usado no teste de ida e volta. */
async function decryptAsUserAgent(body: Uint8Array<ArrayBuffer>, ua: CryptoKeyPair, uaPublicRaw: Uint8Array<ArrayBuffer>, auth: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
  const hk = async (s: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, n: number) =>
    new Uint8Array(
      await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8),
    );
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublicRaw, ...asPublic]);
  const ikm = await hk(auth, ecdh, info, 32);
  const cek = await hk(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hk(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
  expect(plain[plain.length - 1]).toBe(2); // delimitador do último registro
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe("Web Push — criptografia aes128gcm (RFC 8291)", () => {
  it("reproduz o exemplo do Apêndice A da RFC 8291", async () => {
    const local = await ecdhPairFromRaw(
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
      "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    );
    const body = await encryptPayload(
      enc.encode("When I grow up, I want to be a watermelon"),
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      { salt: b64ToBytes("DGv6ra1nlYgDCS1FRnbzlw"), localKeys: local },
    );
    expect(bytesToB64url(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("ida e volta: o navegador consegue decifrar (chaves e salt aleatórios)", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const msg = JSON.stringify({ title: "Reunião com João", body: "Começa em 10 min · 15:00" });
    const body = await encryptPayload(enc.encode(msg), { p256dh: bytesToB64url(uaPublic), auth: bytesToB64url(auth) });
    expect(await decryptAsUserAgent(body, ua, uaPublic, auth)).toBe(msg);
  });

  it("recusa assinatura malformada", async () => {
    await expect(encryptPayload(enc.encode("x"), { p256dh: "abc", auth: "def" })).rejects.toThrow();
  });
});

describe("Web Push — VAPID (RFC 8292)", () => {
  it("gera JWT ES256 válido com aud = origem do endpoint", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const publicKey = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    const d = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
    const now = Date.UTC(2026, 9, 5, 12);
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc123", { publicKey, privateKey: d, subject: "mailto:x@y.z" }, now);

    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, h, c, s, k] = m!;
    expect(k).toBe(publicKey);
    expect(JSON.parse(new TextDecoder().decode(b64ToBytes(h!)))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(new TextDecoder().decode(b64ToBytes(c!)))).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:x@y.z" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, b64ToBytes(s!), enc.encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});

describe("token das ações da notificação", () => {
  it("assina, valida, expira e recusa adulteração", async () => {
    const { createActionToken, verifyActionToken } = await import("../lib/push/action-token");
    const claims = { u: "user-1", t: "task" as const, id: "t1", occ: null, rec: false };
    const now = Date.UTC(2026, 9, 5, 12);
    const token = await createActionToken(claims, "segredo", 3600, now);
    expect(await verifyActionToken(token, "segredo", now)).toMatchObject(claims);
    expect(await verifyActionToken(token, "outro-segredo", now)).toBeNull();
    expect(await verifyActionToken(token, "segredo", now + 3601_000)).toBeNull();
    const [p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, id: "t2", exp: now / 1000 + 3600 })).toString("base64url");
    expect(await verifyActionToken(`${forged}.${s}`, "segredo", now)).toBeNull();
    expect(await verifyActionToken(`${p}`, "segredo", now)).toBeNull();
  });
});
