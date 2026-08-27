import { describe, it, expect } from "vitest";
import {
  getRequiredDisclosures,
  HYPOTHETICAL_RESULTS_WARNING,
  SYNTHETIC_INDICES_DISCLOSURE,
  EU_AI_ACT_TRANSPARENCY,
} from "./performanceDisclosure";

describe("getRequiredDisclosures", () => {
  it("returns hypothetical warning for backtest", () => {
    const d = getRequiredDisclosures(true, false, false);
    expect(d).toHaveLength(1);
    expect(d[0].type).toBe("backtest");
    expect(d[0].required).toBe(true);
    expect(d[0].texts).toContain(HYPOTHETICAL_RESULTS_WARNING);
  });

  it("returns hypothetical warning for demo", () => {
    const d = getRequiredDisclosures(false, true, false);
    expect(d[0].type).toBe("demo");
    expect(d[0].texts).toContain(HYPOTHETICAL_RESULTS_WARNING);
  });

  it("returns synthetic disclosure for synthetic indices", () => {
    const d = getRequiredDisclosures(false, false, true);
    expect(d[0].type).toBe("synthetic");
    expect(d[0].texts).toContain(SYNTHETIC_INDICES_DISCLOSURE);
  });

  it("returns only EU AI Act transparency for live forex", () => {
    const d = getRequiredDisclosures(false, false, false);
    expect(d).toHaveLength(1);
    expect(d[0].type).toBe("live");
    expect(d[0].texts).toContain(EU_AI_ACT_TRANSPARENCY);
  });

  it("all disclosures include EU AI Act transparency", () => {
    const combos: [boolean, boolean, boolean][] = [
      [true, false, false], [false, true, false], [false, false, true], [false, false, false],
    ];
    for (const [bt, demo, synth] of combos) {
      const d = getRequiredDisclosures(bt, demo, synth);
      for (const disc of d) {
        expect(disc.texts).toContain(EU_AI_ACT_TRANSPARENCY);
      }
    }
  });
});
