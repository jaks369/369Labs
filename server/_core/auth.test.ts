import { describe, expect, it } from "vitest";
import { sanitizeUser, hashPassword, verifyPassword } from "./auth";

describe("sanitizeUser", () => {
  it("strips passwordHash and twoFASecret", () => {
    const user = { id: 1, email: "test@test.com", passwordHash: "secret", twoFASecret: "totp-secret", name: "Test" };
    const result = sanitizeUser(user);
    expect(result).toEqual({ id: 1, email: "test@test.com", name: "Test" });
  });

  it("returns null/undefined as-is", () => {
    expect(sanitizeUser(null)).toBeNull();
    expect(sanitizeUser(undefined)).toBeUndefined();
  });

  it("does not mutate the original object", () => {
    const user = { id: 1, passwordHash: "secret", twoFASecret: "totp" };
    const copy = { ...user };
    sanitizeUser(user);
    expect(user).toEqual(copy);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies a password correctly", async () => {
    const password = "MySecureP@ss123!";
    const hash = await hashPassword(password);
    expect(hash).toContain(":");
    expect(hash.split(":")[0].length).toBe(32);
    expect(hash.split(":")[1].length).toBe(128);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects malformed stored hash (no colon)", async () => {
    await expect(verifyPassword("any", "invalidhash")).resolves.toBe(false);
  });

  it("rejects empty parts in stored hash", async () => {
    await expect(verifyPassword("any", ":hashhex")).resolves.toBe(false);
    await expect(verifyPassword("any", "salt:")).resolves.toBe(false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});
