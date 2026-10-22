import { describe, expect, it } from "vitest";
import { conflicts, tree, withSample } from "./workbench";
import { SAMPLE } from "./sample";

describe("workbench view (D-307)", () => {
  it("истинските данни печелят; празно + примери включени → пример, маркиран", () => {
    const empty = (x: number[]) => x.length === 0;
    expect(withSample([1], [9], empty, true)).toEqual({ data: [1], sample: false });
    expect(withSample([], [9], empty, true)).toEqual({ data: [9], sample: true });
    expect(withSample([], [9], empty, false)).toEqual({ data: [], sample: false });
  });
  it("конфликт: два живи агента в едно репо и един файл", () => {
    expect(conflicts([
      { repo: "shop", state: "running", touching: ["src/cart.ts", "a"] }, { repo: "shop", state: "waiting", touching: ["src/cart.ts"] },
      { repo: "api", state: "running", touching: ["src/cart.ts"] }, { repo: "shop", state: "done", touching: ["a"] },
    ])).toEqual([{ repo: "shop", path: "src/cart.ts", sessions: 2 }]);
  });
  it("дърво: водещ агент, после подагентите му", () => {
    expect(tree([{ id: "b", parent_id: "a" }, { id: "a", parent_id: null }, { id: "c", parent_id: null }]).map((x) => `${x.id}${x.depth}`)).toEqual(["a0", "b1", "c0"]);
  });
  it("примерът е пълен за всеки екран и без истински адреси извън localhost", () => {
    expect(SAMPLE.fleet.length).toBeGreaterThan(5);
    expect(SAMPLE.mcp.length).toBeGreaterThan(3);
    expect(SAMPLE.night.shift).not.toBeNull();
    expect(SAMPLE.research.current?.claims.length).toBeGreaterThan(2);
    for (const w of SAMPLE.home.windows) if (w.url) expect(w.url).toMatch(/^http:\/\/localhost/);
    for (const c of SAMPLE.research.current?.claims ?? []) expect(c.text.startsWith("[ПРИМЕР]")).toBe(true);
  });
});
