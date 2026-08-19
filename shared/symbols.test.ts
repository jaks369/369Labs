import { describe, expect, it } from "vitest";
import {
  normalizeSymbol,
  filterValidSymbols,
  getSymbolDisplayName,
  getSymbolByDisplayName,
  getAllSymbols,
  getStandardVolatilitySymbols,
  getAllVolatilitySymbols,
} from "./symbols";

describe("symbol normalization", () => {
  it("accepts raw codes verbatim", () => {
    expect(normalizeSymbol("R_100")).toBe("R_100");
    expect(normalizeSymbol("1HZ10V")).toBe("1HZ10V");
    expect(normalizeSymbol("BOOM500")).toBe("BOOM500");
    expect(normalizeSymbol("CRASH1000")).toBe("CRASH1000");
  });

  it("accepts compact code forms", () => {
    expect(normalizeSymbol("R100")).toBe("R_100");
    expect(normalizeSymbol("R50")).toBe("R_50");
    expect(normalizeSymbol("HZ90V")).toBe("1HZ90V");
    expect(normalizeSymbol("1HZ25")).toBe("1HZ25V");
  });

  it("accepts the friendly names shown in the UI", () => {
    expect(normalizeSymbol("Volatility 100 Index")).toBe("R_100");
    expect(normalizeSymbol("Volatility 100")).toBe("R_100");
    expect(normalizeSymbol("volatility 10 (1s) index")).toBe("1HZ10V");
    expect(normalizeSymbol("Volatility 90 (1s)")).toBe("1HZ90V");
    expect(normalizeSymbol("Boom 500 Index")).toBe("BOOM500");
    expect(normalizeSymbol("Boom 1000")).toBe("BOOM1000");
    expect(normalizeSymbol("Crash 300 Index")).toBe("CRASH300");
  });

  it("leaves unknown input unchanged so callers can report it as unrecognised", () => {
    expect(normalizeSymbol("FOO")).toBe("FOO");
    expect(normalizeSymbol("banana")).toBe("BANANA");
  });

  it("filterValidSymbols keeps only known symbols after normalization", () => {
    const parsed = "Volatility 100 Index, 1HZ10V, Boom 500 Index, NOPE".split(",").map(normalizeSymbol);
    expect(filterValidSymbols(parsed)).toEqual(["R_100", "1HZ10V", "BOOM500"]);
  });

  it("display name lookup is bidirectional with normalization", () => {
    expect(getSymbolByDisplayName("Volatility 100 Index")).toBe("R_100");
    expect(getSymbolDisplayName("R_100")).toBe("Volatility 100 Index");
    expect(getAllSymbols().length).toBeGreaterThan(0);
    expect(getStandardVolatilitySymbols()).toContain("R_100");
    expect(getAllVolatilitySymbols()).toContain("1HZ10V");
  });
});