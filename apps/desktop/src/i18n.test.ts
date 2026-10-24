import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DESKTOP_BG, DESKTOP_EN, desktopLang, dt, loadingPage } from "./i18n.js";

// E7е: the desktop window speaks the language of the person: MANDAT_LANG, else the system locale, else English.
describe("desktop i18n (E7е)", () => {
  it("en and bg have the same keys, none empty, every {param} kept", () => {
    expect(Object.keys(DESKTOP_BG).sort()).toEqual(Object.keys(DESKTOP_EN).sort());
    for (const [k, v] of Object.entries(DESKTOP_EN)) {
      const b = DESKTOP_BG[k as keyof typeof DESKTOP_BG];
      expect(v.trim(), k).not.toBe("");
      expect(b.trim(), k).not.toBe("");
      for (const p of v.match(/\{\w+\}/g) ?? []) expect(b, k).toContain(p);
    }
  });
  it("MANDAT_LANG wins, then the system locale, else English", () => {
    expect(desktopLang({}, "en-US")).toBe("en");
    expect(desktopLang({}, "bg")).toBe("bg");
    expect(desktopLang({}, "bg-BG")).toBe("bg");
    expect(desktopLang({ MANDAT_LANG: "en" }, "bg-BG")).toBe("en");
    expect(desktopLang({ MANDAT_LANG: "bg" }, "de-DE")).toBe("bg");
    expect(desktopLang({ MANDAT_LANG: "xx" }, "")).toBe("en");
  });
  it("templates fill {params}; the loading page is in the chosen language, with <html lang>", () => {
    expect(dt("en", "error.exit", { code: 3 })).toBe("the harness exited with 3");
    expect(dt("bg", "error.exit", { code: 3 })).toBe("харнесът излезе с 3");
    expect(decodeURIComponent(loadingPage("en"))).toContain('<html lang="en">');
    expect(decodeURIComponent(loadingPage("en"))).toContain("The harness is starting");
    expect(decodeURIComponent(loadingPage("bg"))).toContain("Харнесът се пуска");
  });
  it("no Cyrillic outside the catalog in apps/desktop/src (the tests aside; AC-12.10)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const bad = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "i18n.ts" && f !== "banner.ts") // banner.ts parses the CLI output in both languages, it shows nothing
      .filter((f) => /[\u0400-\u04FF]/.test(readFileSync(path.join(dir, f), "utf8")));
    expect(bad).toEqual([]);
  });
});
