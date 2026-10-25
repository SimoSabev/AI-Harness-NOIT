import { describe, expect, it } from "vitest";
import { bg } from "./bg";
import { en } from "./en";
import { LANGS, pagePath, translate } from "./t";

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// E9g B (D-377): the site's catalog, the same style as apps/web (E7е): English the source, Bulgarian the translation.
describe("site i18n catalog (E9g B)", () => {
  it("en and bg have the same keys and no empty values", () => {
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of [...Object.entries(en), ...Object.entries(bg)]) expect(v.trim(), k).not.toBe("");
  });
  it("every {param} of an English string exists in the Bulgarian one", () => {
    for (const [k, v] of Object.entries(en)) {
      const b = bg[k as keyof typeof bg];
      for (const p of params(v)) expect(params(b), `${k}: {${p}}`).toContain(p);
    }
  });
  it("English is not Cyrillic; Bulgarian is translated", () => {
    for (const [k, v] of Object.entries(en)) if (!k.startsWith("lang.name.")) expect(/[Ѐ-ӿ]/.test(v), k).toBe(false);
    const translated = Object.keys(en).filter((k) => /[Ѐ-ӿ]/.test(bg[k as keyof typeof bg])).length;
    expect(translated / Object.keys(en).length).toBeGreaterThan(0.8);
  });
  it("templates and page paths", () => {
    expect(translate("en", "download.cta", { os: "macOS" })).toBe("Download for macOS");
    expect(translate("en", "download.cta", {})).toBe("Download for {os}");
    expect(LANGS).toEqual(["en", "bg"]);
    expect(pagePath("en", "/")).toBe("/");
    expect(pagePath("en", "/download/")).toBe("/download/");
    expect(pagePath("bg", "/")).toBe("/bg/");
    expect(pagePath("bg", "/download/")).toBe("/bg/download/");
  });
});
