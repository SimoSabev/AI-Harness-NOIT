import { describe, expect, it } from "vitest";
import { memoryGraph } from "./graph.js";
import { REPO, mem } from "./items.test-helper.js";

describe("графът на паметта (D-392)", () => {
  const a = mem("Тестовете се пускат с pnpm vitest", { scope: "project", repo_id: REPO });
  const b = mem("Ползвам pnpm навсякъде", { kind: "preference" });
  const c = mem("Старо: ползвам npm", { status: "invalid", superseded_by: b.id });
  const g = memoryGraph([a, b, c], { [REPO]: "shop" });

  it("възли: ти, проектите, спомените, общите същности; връзки: обхват, същност, замяна", () => {
    expect(g.nodes.filter((n) => n.type === "root").map((n) => n.label)).toEqual(["you", "shop"]);
    expect(g.nodes.filter((n) => n.type === "memory").map((n) => n.id)).toEqual([a.id, b.id, c.id]);
    expect(g.nodes.filter((n) => n.type === "entity").map((n) => n.label)).toEqual(["pnpm"]);
    expect(g.edges).toEqual(expect.arrayContaining([
      { from: a.id, to: `repo:${REPO}`, kind: "scope" },
      { from: b.id, to: "you", kind: "scope" },
      { from: a.id, to: "entity:pnpm", kind: "about" },
      { from: b.id, to: "entity:pnpm", kind: "about" },
      { from: c.id, to: b.id, kind: "superseded" },
    ]));
  });
  it("същност само на един спомен не е възел (по-малко шум)", () => {
    expect(g.nodes.some((n) => n.label === "vitest")).toBe(false);
  });
  it("подредбата е детерминистична и в рамката; възлите не се застъпват", () => {
    const again = memoryGraph([a, b, c], { [REPO]: "shop" });
    expect(again.nodes.map((n) => [n.x, n.y])).toEqual(g.nodes.map((n) => [n.x, n.y]));
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1000);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(700);
    }
    for (const n of g.nodes) for (const m of g.nodes) if (n !== m) expect(Math.hypot(n.x - m.x, n.y - m.y)).toBeGreaterThan(10);
  });
  it("празна памет: само „ти“", () => {
    expect(memoryGraph([], {}).nodes.map((n) => n.id)).toEqual(["you"]);
  });
});
