import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { PasswordService } from "./PasswordService.js";
import { testEnv } from "../test/helpers.js";

describe("PasswordService", () => {
  const service = new PasswordService(testEnv);

  it("accepts a valid password", () => {
    expect(service.validate({ password: "valid-passphrase-123" }).ok).toBe(true);
  });

  it("rejects passwords that are too short", () => {
    const result = service.validate({ password: "short1!" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(ErrorCode.INVALID_PASSWORD);
    }
  });

  it("rejects passwords that are too long", () => {
    expect(service.validate({ password: "a".repeat(257) }).ok).toBe(false);
  });

  it("rejects passwords equal to email", () => {
    expect(
      service.validate({
        password: "user@example.com",
        normalizedEmail: "user@example.com",
      }).ok,
    ).toBe(false);
  });

  it("allows passwords with spaces", () => {
    expect(service.validate({ password: "correct horse battery staple" }).ok).toBe(true);
  });

  it("allows long passphrases", () => {
    expect(service.validate({ password: "this is a very long passphrase for reactify" }).ok).toBe(true);
  });

  it("allows unicode passwords", () => {
    expect(service.validate({ password: "パスワードは十分長いです" }).ok).toBe(true);
  });

  it("hashes differ from plaintext", async () => {
    const hash = await service.hashPassword("valid-passphrase-123");
    expect(hash).not.toBe("valid-passphrase-123");
  });

  it("verifies the correct password", async () => {
    const hash = await service.hashPassword("valid-passphrase-123");
    expect(await service.verifyPassword(hash, "valid-passphrase-123")).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await service.hashPassword("valid-passphrase-123");
    expect(await service.verifyPassword(hash, "wrong-passphrase-123")).toBe(false);
  });

  it("produces different hashes for the same password", async () => {
    const first = await service.hashPassword("valid-passphrase-123");
    const second = await service.hashPassword("valid-passphrase-123");
    expect(first).not.toBe(second);
  });
});
