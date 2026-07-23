import { describe, it, expect } from "vitest";

describe("navigation shortcuts", () => {
  const SHORTCUTS = [
    { key: "1", path: "/dashboard", label: "Command Center" },
    { key: "2", path: "/ai-assistant", label: "AI Assistant" },
    { key: "3", path: "/strategy-builder", label: "Strategy Builder" },
    { key: "4", path: "/backtesting", label: "Backtesting" },
    { key: "5", path: "/bots", label: "Bots" },
    { key: "6", path: "/portfolio", label: "Portfolio" },
    { key: "7", path: "/journal", label: "Journal" },
    { key: "8", path: "/settings", label: "Settings" },
  ];

  it("has unique keys for all shortcuts", () => {
    const keys = SHORTCUTS.map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique paths for all shortcuts", () => {
    const paths = SHORTCUTS.map(s => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("all shortcuts map to valid paths", () => {
    for (const s of SHORTCUTS) {
      expect(s.path.startsWith("/")).toBe(true);
    }
  });

  it("all shortcuts have labels", () => {
    for (const s of SHORTCUTS) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("is within valid key range", () => {
    for (const s of SHORTCUTS) {
      const n = parseInt(s.key);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(8);
    }
  });
});

describe("hotkey registration", () => {
  it("registers and unregisters hotkeys", () => {
    const hotkeys: any[] = [];
    const register = (hk: any) => { hotkeys.push(hk); return () => { const i = hotkeys.indexOf(hk); if (i >= 0) hotkeys.splice(i, 1); }; };
    const unsub = register({ key: "n", handler: () => {} });
    expect(hotkeys).toHaveLength(1);
    unsub();
    expect(hotkeys).toHaveLength(0);
  });

  it("handles duplicate registration", () => {
    const hotkeys: any[] = [];
    const register = (hk: any) => { hotkeys.push(hk); return () => { const i = hotkeys.indexOf(hk); if (i >= 0) hotkeys.splice(i, 1); }; };
    const hk = { key: "s", handler: () => {} };
    register(hk);
    register(hk);
    expect(hotkeys).toHaveLength(2);
  });
});
