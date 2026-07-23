import { describe, it, expect } from "vitest";

describe("password validation", () => {
  const MIN_LENGTH = 8;
  const REQUIRE_UPPER = true;
  const REQUIRE_LOWER = true;
  const REQUIRE_DIGIT = true;
  const REQUIRE_SPECIAL = true;

  const validate = (pw: string): string[] => {
    const errors: string[] = [];
    if (pw.length < MIN_LENGTH) errors.push(`At least ${MIN_LENGTH} characters`);
    if (REQUIRE_UPPER && !/[A-Z]/.test(pw)) errors.push("At least one uppercase letter");
    if (REQUIRE_LOWER && !/[a-z]/.test(pw)) errors.push("At least one lowercase letter");
    if (REQUIRE_DIGIT && !/\d/.test(pw)) errors.push("At least one digit");
    if (REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(pw)) errors.push("At least one special character");
    return errors;
  };

  it("rejects short passwords", () => {
    expect(validate("Ab1!")).toContain("At least 8 characters");
  });

  it("rejects passwords without uppercase", () => {
    expect(validate("abcdef1!@")).toContain("At least one uppercase letter");
  });

  it("rejects passwords without lowercase", () => {
    expect(validate("ABCDEF1!@")).toContain("At least one lowercase letter");
  });

  it("rejects passwords without digits", () => {
    expect(validate("Abcdefgh!@")).toContain("At least one digit");
  });

  it("rejects passwords without special chars", () => {
    expect(validate("Abcdefgh1")).toContain("At least one special character");
  });

  it("accepts valid passwords", () => {
    expect(validate("StrongP@ss1")).toEqual([]);
    expect(validate("Demo123!@#")).toEqual([]);
  });
});

describe("email validation", () => {
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test.user@domain.co")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });
});

describe("session token validation", () => {
  it("generates tokens of expected length", () => {
    const genToken = (len = 32) => {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    };
    expect(genToken()).toHaveLength(32);
    expect(genToken(64)).toHaveLength(64);
  });

  it("generates unique tokens", () => {
    const genToken = (len = 32) => {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    };
    const tokens = new Set(Array.from({ length: 100 }, genToken));
    expect(tokens.size).toBe(100);
  });
});
