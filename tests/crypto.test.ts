import { describe, expect, it } from "vitest";
import { decrypt, encrypt, encryptMaybe, isEncrypted, randomToken, safeEqual } from "../lib/crypto";

const key = Buffer.alloc(32, 7).toString("base64");
const otherKey = Buffer.alloc(32, 9).toString("base64");

describe("crypto", () => {
  it("criptografa e descriptografa (ida e volta)", async () => {
    const enc = await encrypt("ya29.token-secreto", key);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("token-secreto");
    expect(await decrypt(enc, key)).toBe("ya29.token-secreto");
  });

  it("usa IV aleatório (mesmo texto → cifras diferentes)", async () => {
    expect(await encrypt("x", key)).not.toBe(await encrypt("x", key));
  });

  it("falha com a chave errada ou texto adulterado", async () => {
    const enc = await encrypt("abc", key);
    await expect(decrypt(enc, otherKey)).rejects.toThrow();
    const tampered = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    await expect(decrypt(tampered, key)).rejects.toThrow();
  });

  it("rejeita chave com tamanho errado", async () => {
    await expect(encrypt("abc", Buffer.alloc(16).toString("base64"))).rejects.toThrow(/32 bytes/);
  });

  it("encryptMaybe não recriptografa nem mexe em vazio", async () => {
    expect(await encryptMaybe(null, key)).toBeNull();
    expect(await encryptMaybe("", key)).toBe("");
    const enc = await encrypt("abc", key);
    expect(await encryptMaybe(enc, key)).toBe(enc);
  });

  it("randomToken e safeEqual", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(safeEqual(t, t)).toBe(true);
    expect(safeEqual(t, randomToken())).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});
