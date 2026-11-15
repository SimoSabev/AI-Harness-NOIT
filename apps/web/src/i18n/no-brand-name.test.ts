import { describe, expect, it } from "vitest";
import { bg } from "./bg";
import { en } from "./en";

// D-524 (Simo, 15.11.2026): the product has no name yet and Mandat was only a working name, so no screen text names it;
// the screens say what happens ("the result is checked"). A command or file name (pnpm mandat …, .mandat.yml) is not a name.
// The example in the task box and the empty-state hint do not point to the demo project or the demo agents.
describe("no product name and no demo on the screens (D-524)", () => {
  it("no English or Bulgarian text says Mandat", () => {
    const named = [...Object.entries(en), ...Object.entries(bg)].filter(([, v]) => /\bMandat\b|Мандат/.test(v)).map(([k]) => k);
    expect(named).toEqual([]);
  });
  it("the task box example and the first-task hint are not about the demo", () => {
    for (const k of ["ws.placeholder", "home.emptyHint", "research.form.noModels"] as const) {
      expect(en[k], k).not.toMatch(/demo|10%|discount/i);
      expect(bg[k], k).not.toMatch(/демо|10%|отстъпка/i);
    }
  });
});
