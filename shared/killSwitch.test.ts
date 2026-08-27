import { describe, it, expect, beforeEach } from "vitest";
import {
  activateKillSwitch,
  deactivateKillSwitch,
  isSystemKilled,
  getKillSwitchState,
} from "./killSwitch";
import { DEFAULT_MODEL_CARD, type ModelCard } from "./modelCard";

describe("killSwitch", () => {
  beforeEach(() => {
    deactivateKillSwitch(); // reset before each test
  });

  it("starts in active state", () => {
    expect(isSystemKilled()).toBe(false);
    expect(getKillSwitchState().state).toBe("active");
  });

  it("activates kill switch", () => {
    const state = activateKillSwitch("Testing emergency stop");
    expect(state.state).toBe("killed");
    expect(state.killedAt).toBeInstanceOf(Date);
    expect(state.reason).toBe("Testing emergency stop");
    expect(isSystemKilled()).toBe(true);
  });

  it("deactivates kill switch", () => {
    activateKillSwitch("test");
    const state = deactivateKillSwitch();
    expect(state.state).toBe("active");
    expect(state.killedAt).toBeNull();
    expect(isSystemKilled()).toBe(false);
  });

  it("returns copy, not reference", () => {
    const s1 = getKillSwitchState();
    const s2 = getKillSwitchState();
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
  });
});

describe("modelCard", () => {
  it("has required fields", () => {
    const card: ModelCard = DEFAULT_MODEL_CARD;
    expect(card.systemName).toBeTruthy();
    expect(card.version).toBeTruthy();
    expect(card.intendedPurpose).toBeTruthy();
    expect(card.systemDescription).toBeTruthy();
    expect(card.inputTypes.length).toBeGreaterThan(0);
    expect(card.outputTypes.length).toBeGreaterThan(0);
    expect(card.limitations.length).toBeGreaterThan(0);
    expect(card.oversightMeasures.length).toBeGreaterThan(0);
    expect(card.lastUpdated).toBeTruthy();
  });

  it("includes kill-switch as oversight measure", () => {
    expect(DEFAULT_MODEL_CARD.oversightMeasures.some((m) => m.includes("kill-switch"))).toBe(true);
  });
});
