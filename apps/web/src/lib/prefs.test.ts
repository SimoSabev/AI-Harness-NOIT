import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES, VIEWS, parseSample, parseTheme, parseView, prefCookie } from "./prefs";

describe("prefs (D-305)", () => {
  it("тема и изглед: непозната стойност → по подразбиране (тъмна, карта)", () => {
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("<script>")).toBe("dark");
    expect(parseView(undefined)).toBe("map");
    expect(parseView("columns")).toBe("columns");
    expect(parseView("project")).toBe("project");
    expect(parseView("list")).toBe("list");
    expect(parseView("x")).toBe("map");
    expect(THEMES.map((t) => t.id)).toEqual(["dark", "light", "system"]);
    expect(VIEWS.map((v) => v.id)).toEqual(["map", "columns", "project", "list"]);
  });
  it("примерите са включени, докато не ги изключиш", () => {
    expect(parseSample(undefined)).toBe(true);
    expect(parseSample("1")).toBe(true);
    expect(parseSample("0")).toBe(false);
  });
  it("бисквитката е за цялия сайт, година, SameSite=Lax", () => {
    expect(prefCookie("theme", "light")).toBe("theme=light; Path=/; Max-Age=31536000; SameSite=Lax");
  });
  it("светлата тема и „като системата“ при светла система са едни и същи стойности", () => {
    const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8");
    const block = (sel: string) => {
      const i = css.indexOf(sel);
      const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
      return Object.fromEntries([...body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
    };
    const light = block(':root[data-theme="light"]');
    const system = block(':root[data-theme="system"]');
    const dark = block(':root[data-theme="dark"]');
    expect(Object.keys(light).length).toBeGreaterThan(15);
    expect(system).toEqual(light);
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
});
