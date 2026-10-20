import { describe, expect, it } from "vitest";
import type { ParsedReport, TestStatus } from "@mandat/contract";
import { d2 } from "./index.js";
import type { WeakenedAssertion } from "./index.js";

// D-233 / S2 / S31: D2:weakened, weakened_assertions, report_mismatch.
const M = "tests/cart.spec.ts > cart > applies 10% over 50";
const N = "tests/cart.spec.ts > cart > no discount under 50";
const rep = (m: Record<string, TestStatus>): ParsedReport => ({ valid: true, success: Object.values(m).every((s) => s !== "failed"), total: Object.keys(m).length, tests: new Map(Object.entries(m)) });
const baseline = rep({ [M]: "failed", [N]: "passed" });
const findings = (r: ReturnType<typeof d2>) => (r.evidence.data as { findings: { cls: string; id: string }[] }).findings;
const run = (o: Partial<Parameters<typeof d2>[0]>) => d2({ baseline, b: rep({ [M]: "passed", [N]: "passed" }), exitB: 0, diffPatch: "", mayChangeTests: false, ...o });

describe("d2-weakened", () => {
  it("M failed в A и passed в B → fail D2:weakened:<M>", () => {
    const r = run({ a: rep({ [M]: "failed", [N]: "passed" }) });
    expect(r.evidence.status).toBe("fail");
    expect(r.evidence.signature).toContain("weakened");
    expect(findings(r)).toEqual([{ cls: "weakened", id: M }]);
  });
  it("при may_change_tests → unknown", () => {
    expect(run({ a: rep({ [M]: "failed", [N]: "passed" }), mayChangeTests: true }).evidence.status).toBe("unknown");
  });
  it("честна поправка (M passed в A) → pass", () => {
    expect(run({ a: rep({ [M]: "passed", [N]: "passed" }) }).evidence.status).toBe("pass");
  });
  it("без A (E0 повикване) → без weakened", () => {
    expect(run({}).evidence.status).toBe("pass");
  });
  it("редът: missing_test → weakened → weakened_assertions → skipped", () => {
    const r = d2({
      baseline: rep({ [M]: "failed", [N]: "passed", "tests/x.spec.ts > x > gone": "passed" }),
      b: rep({ [M]: "passed", [N]: "skipped" }),
      a: rep({ [M]: "failed", [N]: "passed" }),
      weakenedAssertions: [{ id: N, level: "fail", base: 2, head: 1 }],
      exitB: 0, diffPatch: "", mayChangeTests: false,
    });
    expect(findings(r).map((f) => f.cls)).toEqual(["missing_test", "weakened", "weakened_assertions", "skipped"]);
  });
});

describe("weakened_assertions клас", () => {
  const wa: WeakenedAssertion[] = [{ id: M, level: "fail", base: 2, head: 1 }];
  it("fail при !may_change_tests и при --external; unknown при may_change_tests", () => {
    expect(run({ weakenedAssertions: wa }).evidence.status).toBe("fail");
    expect(run({ weakenedAssertions: wa, mayChangeTests: true }).evidence.status).toBe("unknown");
    expect(run({ weakenedAssertions: wa, mayChangeTests: true, external: true }).evidence.status).toBe("fail");
    expect(run({ weakenedAssertions: [{ id: M, level: "unknown", base: 3, head: 1 }] }).evidence.status).toBe("unknown");
  });
});

describe("report-mismatch (S31)", () => {
  it("повече passed ID-та от декларираните → UNKNOWN D2:report_mismatch:-", () => {
    const r = run({ declaredTests: 1 });
    expect(r.evidence.status).toBe("unknown");
    expect(findings(r)).toEqual([{ cls: "report_mismatch", id: "-" }]);
  });
  it("равен брой или динамични файлове (null) → pass", () => {
    expect(run({ declaredTests: 2 }).evidence.status).toBe("pass");
    expect(run({ declaredTests: null }).evidence.status).toBe("pass");
  });
});
