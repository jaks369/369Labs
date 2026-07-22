import { describe, expect, it } from "vitest";
import { buildResetEmail, buildVerificationEmail, buildNotificationEmail } from "./email";

describe("buildResetEmail", () => {
  it("includes the reset URL", () => {
    const html = buildResetEmail("https://example.com/reset?token=abc123");
    expect(html).toContain("https://example.com/reset?token=abc123");
    expect(html).toContain("Reset your 369Labs password");
    expect(html).toContain("Reset Password");
  });

  it("is valid HTML (starts with doctype, closes body)", () => {
    const html = buildResetEmail("https://example.com/reset");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });
});

describe("buildVerificationEmail", () => {
  it("includes the verify URL", () => {
    const html = buildVerificationEmail("https://example.com/verify?code=xyz");
    expect(html).toContain("https://example.com/verify?code=xyz");
    expect(html).toContain("Verify your email");
    expect(html).toContain("Verify Email");
  });

  it("is valid HTML", () => {
    const html = buildVerificationEmail("https://example.com/verify");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });
});

describe("buildNotificationEmail", () => {
  it("includes title and body", () => {
    const html = buildNotificationEmail("Bot Alert", "Your bot stopped running.");
    expect(html).toContain("Bot Alert");
    expect(html).toContain("Your bot stopped running.");
  });

  it("includes optional details as preformatted block", () => {
    const html = buildNotificationEmail("Alert", "Check details below.", "Error: timeout\nLine: 42");
    expect(html).toContain("<pre");
    expect(html).toContain("Error: timeout");
  });

  it("omits details block when not provided", () => {
    const html = buildNotificationEmail("Alert", "Simple notification");
    expect(html).not.toContain("<pre");
  });

  it("is valid HTML", () => {
    const html = buildNotificationEmail("Title", "Body");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });
});
