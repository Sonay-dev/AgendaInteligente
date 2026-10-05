import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../lib/password";

describe("password (PBKDF2)", () => {
  it("gera hash no formato esperado e confere a senha certa", async () => {
    const hash = await hashPassword("senha-bem-longa-123");
    expect(hash).toMatch(/^pbkdf2:sha256:100000:[\w-]+:[\w-]+$/);
    expect(hash).not.toContain("senha-bem-longa");
    expect(await verifyPassword({ hash, password: "senha-bem-longa-123" })).toBe(true);
  });

  it("recusa senha errada", async () => {
    const hash = await hashPassword("senha-bem-longa-123");
    expect(await verifyPassword({ hash, password: "senha-bem-longa-124" })).toBe(false);
  });

  it("usa salt aleatório (mesma senha → hashes diferentes)", async () => {
    expect(await hashPassword("abcdefghij")).not.toBe(await hashPassword("abcdefghij"));
  });

  it("recusa hash malformado ou com iterações acima do limite do Workers", async () => {
    expect(await verifyPassword({ hash: "lixo", password: "x" })).toBe(false);
    expect(await verifyPassword({ hash: "pbkdf2:sha256:999999:abc:def", password: "x" })).toBe(false);
    expect(await verifyPassword({ hash: "scrypt:abc", password: "x" })).toBe(false);
  });
});
