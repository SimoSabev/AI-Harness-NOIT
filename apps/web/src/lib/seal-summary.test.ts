import { describe, expect, it } from "vitest";
import { sealSummary } from "./seal-summary";

// D-710 (night 27.11.2026, three critics): the seal card says what the person decides, in the same sentences as the
// task page, and keeps what simply did not run apart from what needs a decision. Never a detector code or a hash.
const seal = (verdict: "VERIFIED" | "UNKNOWN" | "FAILED", unchecked: string[], checked = ["AC-1", "AC-2", "AC-3"]) => ({ verdict, checked, unchecked });

describe("the seal card's summary (D-710)", () => {
  it("VERIFIED: every criterion passes, nothing to decide", () => {
    expect(sealSummary(seal("VERIFIED", []), "en")).toEqual({ headline: "verified", passed: 3, of: 3, decide: [], notRun: [] });
  });
  it("UNKNOWN from a surviving mutant: what changing it did and what to do, with the place; a check that did not run is apart", () => {
    const s = sealSummary(seal("UNKNOWN", ["D10.lockfile: not run", "D11.mutation: a mutant survived at src/giftcards/cards.ts:1 (0 → 1); a person decides"]), "en");
    expect(s.headline).toBe("unknown");
    // (critic 27.11: its own sentence, not the task page's — that one names the code name and asks for a test the card cannot add)
    expect(s.decide).toEqual([{ text: "Changing 0 → 1 on this line broke nothing the tests check. Merge if it does not matter; otherwise ask for a test in the box below.", where: "src/giftcards/cards.ts:1", change: "0 → 1" }]);
    expect(s.notRun).toEqual(["whether the lockfile matches the code"]);
    for (const x of [...s.decide.map((d) => d.text), ...s.notRun]) expect(x).not.toMatch(/D1[01]\.|a person decides/);
  });
  it("criteria a person proves, migration sites and the oracle's grade are decisions; criteria count them", () => {
    const s = sealSummary(seal("UNKNOWN", ["AC-4: proof by a person", "src/old.ts: a migration site for a person", "D11.oracle: the hidden tests caught 3/10 mutants; a person decides"]), "bg");
    expect(s.of).toBe(4);
    expect(s.passed).toBe(3);
    expect(s.decide.map((d) => d.where)).toEqual(["AC-4", "src/old.ts", null]);
    expect(s.decide.map((d) => d.text).join(" ")).toContain("3 от 10");
  });
  it("an unknown detector still reads as words, never as its code", () => {
    expect(sealSummary(seal("UNKNOWN", ["D99.new: not run"]), "en").notRun).toEqual(["another check"]);
    // a gate's name is a claim: asked, never stated as if it passed
    expect(sealSummary(seal("UNKNOWN", ["D5.hidden: not run"]), "en").notRun).toEqual(["whether the hidden acceptance tests pass"]);
    expect(sealSummary(seal("UNKNOWN", ["D1.base_tests: not run"]), "bg").notRun[0]).toMatch(/^дали /);
  });
  it("FAILED is failed", () => {
    expect(sealSummary(seal("FAILED", []), "en").headline).toBe("failed");
  });
});
