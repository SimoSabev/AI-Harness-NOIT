import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCENTS, GROUNDS, NOVAS, appearanceAttrs, inkOn, parseAppearance } from "./appearance";

// D-599: Settings → Appearance. The accent (Harnova green by default), the ground, Nova's colour and the size are the
// person's; kept in cookies (read by the server, so the page paints in their colours from the first byte). The text on
// a custom accent is dark or white by its luminance, so the decision button always reads.
describe("appearance (D-599)", () => {
  it("unknown or unsafe values fall back to the brand defaults", () => {
    expect(parseAppearance({})).toEqual({ accent: null, ground: "night", nova: null, scale: 100 });
    expect(parseAppearance({ accent: "red;}body{", ground: "x", nova: "url(x)", scale: "999" })).toEqual({ accent: null, ground: "night", nova: null, scale: 100 });
    expect(parseAppearance({ accent: "#2F7FF0", ground: "warm", nova: "#3fc7d8", scale: "115" })).toEqual({ accent: "#2f7ff0", ground: "warm", nova: "#3fc7d8", scale: 115 });
    expect(parseAppearance({ scale: "70" }).scale).toBe(100);
    expect(parseAppearance({ scale: "112" }).scale).toBe(110);
  });
  it("the ink on an accent is dark on light colours and white on dark ones", () => {
    expect(inkOn("#a6c25e")).toBe("#121807");
    expect(inkOn("#f2c14e")).toBe("#121807");
    expect(inkOn("#2f7ff0")).toBe("#ffffff");
    expect(inkOn("#4f681c")).toBe("#ffffff");
  });
  it("the html attributes: nothing for the defaults; a custom accent, ground, Nova and size otherwise", () => {
    expect(appearanceAttrs(parseAppearance({}))).toEqual({ data: {}, style: {} });
    const a = appearanceAttrs({ accent: "#2f7ff0", ground: "warm", nova: "#3fc7d8", scale: 115 });
    expect(a.data).toEqual({ "data-accent": "custom", "data-ground": "warm" });
    expect(a.style).toEqual({ "--user-accent": "#2f7ff0", "--user-accent-ink": "#ffffff", "--nova": "#3fc7d8", fontSize: "115%" });
  });
  it("the choices: six accents with green first, four grounds, Nova as the accent or its own colour", () => {
    expect(ACCENTS).toHaveLength(6);
    expect(ACCENTS[0]?.id).toBe("green");
    expect(GROUNDS.map((g) => g.id)).toEqual(["night", "graphite", "warm", "black"]);
    expect(NOVAS[0]?.id).toBe("accent");
  });
  it("the token file has a block for each ground and for a custom accent in both themes", () => {
    const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../app/tokens.css"), "utf8");
    for (const g of ["graphite", "warm", "black"]) {
      expect(css).toContain(`:root[data-ground="${g}"]`);
      expect(css).toContain(`:root[data-ground="${g}"][data-theme="light"]`);
    }
    expect(css).toMatch(/:root\[data-accent="custom"\]\s*\{[^}]*--accent:\s*var\(--user-accent\)/);
    expect(css).toContain(':root[data-accent="custom"][data-theme="light"]');
  });
});
