import { describe, expect, it } from "vitest";
import { bg } from "./bg";
import { en } from "./en";
import { LOCALE, parseLang, plural, translate, translator } from "./t";

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// E7е (AC-12.10, U7): one catalog, English the source, Bulgarian the translation.
describe("i18n catalog (E7е)", () => {
  it("en and bg have the same keys", () => {
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort());
  });
  it("no empty values in either language", () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(bg)]) expect(v.trim(), k).not.toBe("");
  });
  it("every {param} of an English string exists in the Bulgarian one", () => {
    for (const [k, v] of Object.entries(en)) {
      const b = bg[k as keyof typeof bg];
      for (const p of params(v)) expect(params(b), `${k}: {${p}}`).toContain(p);
    }
  });
  it("English strings are not Cyrillic; Bulgarian ones are not copied English (except names and codes)", () => {
    for (const [k, v] of Object.entries(en)) expect(/[\u0400-\u04FF]/.test(v), k).toBe(false);
    const translated = Object.keys(en).filter((k) => /[\u0400-\u04FF]/.test(bg[k as keyof typeof bg])).length;
    expect(translated / Object.keys(en).length).toBeGreaterThan(0.8);
  });
});

describe("language choice (E7е)", () => {
  it("the cookie wins, then Accept-Language, then English", () => {
    expect(parseLang("bg", "en-US,en;q=0.9")).toBe("bg");
    expect(parseLang("en", "bg-BG,bg;q=0.9")).toBe("en");
    expect(parseLang(undefined, "bg-BG,bg;q=0.9,en;q=0.8")).toBe("bg");
    expect(parseLang(undefined, "de-DE,de;q=0.9,bg;q=0.5")).toBe("bg");
    expect(parseLang(undefined, "de-DE,en;q=0.4,bg;q=0.5")).toBe("bg");
    expect(parseLang(undefined, "fr-FR")).toBe("en");
    expect(parseLang("xx", null)).toBe("en");
    expect(parseLang(undefined, undefined)).toBe("en");
    expect(parseLang(undefined, "bg;q=0")).toBe("en");
  });
  it("templates fill {params}; a missing param stays visible", () => {
    expect(translate("en", "inbox.summary", { merged: 1, failed: 2, waiting: "3 waiting for you" })).toBe("1 VERIFIED and merged on their own · 2 FAILED · 3 waiting for you");
    expect(translate("bg", "inbox.summary", { merged: 1, failed: 2, waiting: "3 чакат теб" })).toBe("1 ПРОВЕРЕНО и слети сами · 2 ПРОВАЛ · 3 чакат теб");
    expect(translate("en", "harness.blocked", {})).toBe("Blocked: {reason}");
  });
  it("plurals follow the language (Intl.PluralRules)", () => {
    expect(plural("bg", "inbox.waitingYou", 1)).toBe("1 чака теб");
    expect(plural("bg", "inbox.waitingYou", 2)).toBe("2 чакат теб");
    expect(plural("en", "diff.files", 1)).toBe("1 file");
    expect(plural("en", "diff.files", 3)).toBe("3 files");
  });
  it("numbers and money by locale", () => {
    const t = translator("bg");
    expect(t.lang).toBe("bg");
    expect(t.num(1.5, 1)).toBe("1,5");
    expect(t.usd(2)).toBe("$2,00");
    expect(translator("en").usd(1234.5)).toBe("$1,234.50");
    expect(t("nav.settings")).toBe("Настройки");
    expect(translator("en")("nav.settings")).toBe("Settings");
    expect(t.n("diff.files", 2)).toBe("2 файла");
    expect(LOCALE.en).toMatch(/^en/);
  });
});
