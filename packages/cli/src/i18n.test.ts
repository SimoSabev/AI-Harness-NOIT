import { describe, expect, it } from "vitest";
import { TUI_BG, TUI_EN, cliLang, tt } from "./i18n.js";

// E7е: the terminal UI has its own small catalog (same key style as apps/web): English by default, Bulgarian by choice.
describe("cli i18n (E7е)", () => {
  it("en and bg have the same keys, none empty, every {param} kept", () => {
    expect(Object.keys(TUI_BG).sort()).toEqual(Object.keys(TUI_EN).sort());
    for (const [k, v] of Object.entries(TUI_EN)) {
      const b = TUI_BG[k as keyof typeof TUI_BG];
      expect(v.trim(), k).not.toBe("");
      expect(b.trim(), k).not.toBe("");
      for (const p of v.match(/\{\w+\}/g) ?? []) expect(b, k).toContain(p);
    }
  });
  it("MANDAT_LANG wins, then the system locale (LC_ALL, LC_MESSAGES, LANG), else English", () => {
    expect(cliLang({})).toBe("en");
    expect(cliLang({ MANDAT_LANG: "bg" })).toBe("bg");
    expect(cliLang({ MANDAT_LANG: "en", LANG: "bg_BG.UTF-8" })).toBe("en");
    expect(cliLang({ LANG: "bg_BG.UTF-8" })).toBe("bg");
    expect(cliLang({ LC_ALL: "en_US.UTF-8", LANG: "bg_BG.UTF-8" })).toBe("en");
    expect(cliLang({ LC_MESSAGES: "bg_BG", LANG: "C" })).toBe("bg");
    expect(cliLang({ MANDAT_LANG: "de", LANG: "C.UTF-8" })).toBe("en");
  });
  it("templates fill {params}", () => {
    expect(tt("en", "tui.done24h", { n: 2 })).toBe("2 done in 24 h");
    expect(tt("bg", "tui.done24h", { n: 2 })).toBe("2 готови за 24 ч");
  });
});
