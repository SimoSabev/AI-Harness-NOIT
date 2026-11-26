import { describe, expect, it } from "vitest";
import { bg } from "./bg";
import { en } from "./en";

// D-524 (Simo, 15.11.2026): Mandat was only a working name, so no screen text names it; the screens say what happens
// ("the result is checked"). A command or file name (pnpm mandat …, .mandat.yml) is not a name.
// D-596 (Simo, 24.11.2026): the product is Harnova and its voice is Nova. "the harness"/"харнесът" as the name of the
// product and the old voice name Jarvis are gone from every screen (the catalog keys harness.* are only keys).
// The example in the task box and the empty-state hint do not point to the demo project or the demo agents.
describe("the product's name on the screens (D-524, D-596)", () => {
  const all = [...Object.entries(en), ...Object.entries(bg)];
  it("no English or Bulgarian text says Mandat", () => {
    expect(all.filter(([, v]) => /\bMandat\b|Мандат/.test(v)).map(([k]) => k)).toEqual([]);
  });
  it("no text names the product harness or the voice Jarvis (D-596)", () => {
    expect(all.filter(([, v]) => /harness|харнес|jarvis|джарвис/i.test(v)).map(([k]) => k)).toEqual([]);
  });
  it("the voice is Nova in both languages (D-596)", () => {
    expect(en["voice.button"]).toBe("Nova");
    expect(bg["voice.button"]).toBe("Nova");
    expect(en["voice.talk"]).toBe("Talk to Nova");
    expect(bg["voice.talk"]).toBe("Говори с Nova");
  });
  it("the task box example and the first-task hint are not about the demo", () => {
    for (const k of ["chat.placeholder", "home.emptyHint", "research.form.noModels"] as const) {
      expect(en[k], k).not.toMatch(/demo|10%|discount/i);
      expect(bg[k], k).not.toMatch(/демо|10%|отстъпка/i);
    }
  });
});
