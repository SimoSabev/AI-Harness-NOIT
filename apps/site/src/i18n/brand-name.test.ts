import { describe, expect, it } from "vitest";
import { bg } from "./bg";
import { en } from "./en";

// D-596 (Simo, 24.11.2026): the product is Harnova and its voice is Nova, on every page of the site in both languages.
// "the harness"/"харнесът" as the product's name and the old app name Harness are gone (the repository's URL aside).
describe("the product's name on the site (D-596)", () => {
  it("the brand is Harnova", () => {
    expect(en["brand.name"]).toBe("Harnova");
    expect(bg["brand.name"]).toBe("Harnova");
  });
  it("no page text names the product harness or the voice Jarvis", () => {
    const all = [...Object.entries(en), ...Object.entries(bg)];
    expect(all.filter(([, v]) => /harness|харнес|jarvis|джарвис/i.test(v)).map(([k]) => k)).toEqual([]);
  });
  it("the macOS install steps name the app Harnova", () => {
    expect(en["install.mac.2"]).toMatch(/Harnova/);
    expect(bg["install.mac.2"]).toMatch(/Harnova/);
  });
});
