import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHOT_NAMES, shotSrc } from "./shots";

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

// E9g B step 7 (D-378): the real UI screenshots (scripts/site-shots.mjs) — every screen of apps/site/shots.json, in both
// languages and both themes, is committed; a missing one is a test failure, never a fake image.
describe("site shots (E9g B)", () => {
  it("the paths are /shots/<screen>-<lang>-<theme>.png", () => {
    expect(shotSrc("inbox", "bg", "light")).toBe("/shots/inbox-bg-light.png");
  });
  it("every screen exists in en/bg × dark/light", () => {
    expect(SHOT_NAMES.length).toBeGreaterThanOrEqual(5);
    const missing = SHOT_NAMES.flatMap((n) => (["en", "bg"] as const).flatMap((l) => (["dark", "light"] as const).map((t) => shotSrc(n, l, t)))).filter((p) => !existsSync(path.join(pub, p)));
    expect(missing).toEqual([]);
  });
});
