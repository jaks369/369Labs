import { describe, it, expect } from "vitest";
import { computeMirrorStake } from "./copyTrader";

describe("copyTrader sizing", () => {
  it("returns zero for invalid leader stakes", () => {
    expect(computeMirrorStake(0, 1, null)).toBe(0);
    expect(computeMirrorStake(-5, 1, null)).toBe(0);
  });

  it("multiplies the leader stake", () => {
    expect(computeMirrorStake(5, 2, null)).toBe(10);
  });

  it("falls back to 1x for a non-positive multiplier", () => {
    expect(computeMirrorStake(5, 0, null)).toBe(5);
  });

  it("caps at the follower's max stake", () => {
    expect(computeMirrorStake(20, 1, 10)).toBe(10);
  });

  it("rounds to cents", () => {
    expect(computeMirrorStake(0.33, 1.5, null)).toBe(0.5);
  });
});