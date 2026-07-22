import { vi, describe, expect, it } from "vitest";

vi.hoisted(() => {
  process.env.ENCRYPTION_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
});

const { encrypt, decrypt } = await import("./encryption");

describe("encrypt / decrypt", () => {
  it("encrypts and decrypts a string", () => {
    const original = "Hello, 369Labs!";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const input = "same-text";
    const enc1 = encrypt(input);
    const enc2 = encrypt(input);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(input);
    expect(decrypt(enc2)).toBe(input);
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles special characters", () => {
    const input = "abc123!@#$%^&*()_+{}[]|\\:;\"'<>,.?/~`\n\t";
    const encrypted = encrypt(input);
    expect(decrypt(encrypted)).toBe(input);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret-data");
    const tampered = encrypted.slice(0, -4) + "dead";
    expect(() => decrypt(tampered)).toThrow();
  });
});
