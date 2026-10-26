import { describe, expect, it } from "vitest";
import { GOLDEN, evaluate } from "./eval.js";

// D-393: the golden set decides whether recall needs vectors. Thresholds below are the gate; if a change of the
// search drops under them, vectors (pgvector) get a spike instead of tuning the words.
describe("златният набор на паметта (D-393)", () => {
  it("има всички видове въпроси: директни, друга форма на думата, същност, обновен факт, въздържане", () => {
    expect(new Set(GOLDEN.cases.map((c) => c.kind))).toEqual(new Set(["direct", "morphology", "entity", "update", "abstain"]));
    expect(GOLDEN.cases.length).toBeGreaterThanOrEqual(20);
  });
  it("recall@5 ≥ 0.9, обновените факти 100%, въздържане 100%", () => {
    const r = evaluate();
    expect(r.failures).toEqual([]);
    expect(r.recallAt5).toBeGreaterThanOrEqual(0.9);
    expect(r.updates).toBe(1);
    expect(r.abstain).toBe(1);
  });
});
