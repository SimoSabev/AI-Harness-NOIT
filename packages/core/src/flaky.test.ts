import { describe, expect, it } from "vitest";
import type { ParsedReport } from "@mandat/contract";
import { d1, flakyFrom } from "./index.js";

const rep = (t: Record<string, "passed" | "failed" | "skipped">): ParsedReport => ({ valid: true, success: Object.values(t).every((s) => s !== "failed"), total: Object.keys(t).length, tests: new Map(Object.entries(t)) });
const A = "tests/a.spec.ts > a > one";
const B = "tests/a.spec.ts > a > two";
const C = "tests/a.spec.ts > a > three";

describe("flaky tests from two baseline runs (E7г, D-314)", () => {
  it("a test ID whose status differs between the runs is flaky; one missing in a run too; sorted", () => {
    expect(flakyFrom(rep({ [A]: "passed", [B]: "failed", [C]: "passed" }), rep({ [A]: "passed", [B]: "passed" }))).toEqual([B, C].sort());
    expect(flakyFrom(rep({ [A]: "passed" }), rep({ [A]: "passed" }))).toEqual([]);
  });
  it("an invalid report → no flaky verdict (nothing is guessed)", () => {
    expect(flakyFrom({ valid: false, error: "missing", detail: "" }, rep({ [A]: "passed" }))).toEqual([]);
  });
  it("D1 skips flaky IDs and names them in evidence data.flaky; a real regression still fails", () => {
    const base = rep({ [A]: "passed", [B]: "passed" });
    const a = rep({ [A]: "passed", [B]: "failed" });
    expect(d1(base, a).evidence.status).toBe("fail");
    const r = d1(base, a, [B]);
    expect(r.evidence.status).toBe("pass");
    expect(r.evidence.data.flaky).toEqual([B]);
    expect(d1(rep({ [A]: "passed", [B]: "passed" }), rep({ [A]: "failed", [B]: "failed" }), [B]).evidence.status).toBe("fail");
  });
});
