import { describe, expect, it } from "vitest";
import { nothingToCheck } from "./index.js";

describe("nothingToCheck (D-447): only facts decide, the model has no say", () => {
  it("zero changed files and no test the contract demands → nothing to check", () => {
    expect(nothingToCheck({ changedFiles: 0, mustPass: [] })).toBe(true);
  });
  it("any change, a deletion included (one changed file), is checked", () => {
    expect(nothingToCheck({ changedFiles: 1, mustPass: [] })).toBe(false);
    expect(nothingToCheck({ changedFiles: 1, mustPass: ["t"] })).toBe(false);
  });
  it("a test the contract demands is always answered, even on an empty change (bench B12)", () => {
    expect(nothingToCheck({ changedFiles: 0, mustPass: ["tests/cart.spec.ts > cart > applies 10% over 50"] })).toBe(false);
  });
  it("there is no other input: the agent's words, exit code or result cannot reach it", () => {
    expect(nothingToCheck.length).toBe(1);
    expect(nothingToCheck({ changedFiles: 1, mustPass: [], agentSaid: "nothing changed" } as Parameters<typeof nothingToCheck>[0])).toBe(false);
  });
});
