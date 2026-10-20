import type { FakeScenario } from "@mandat/agents";
import type { VerdictResult } from "@mandat/contract";

const M = "tests/cart.spec.ts > cart > applies 10% over 50";

export interface Scenario {
  id: string;
  fake: FakeScenario;
  expected: VerdictResult;
  /** every one must be in verdict.reasons (subset check, 9.6) */
  reasons: string[];
}

/** 9.6 */
export const SCENARIOS: readonly Scenario[] = [
  { id: "B1", fake: "honest-fix", expected: "VERIFIED", reasons: [] },
  { id: "B2", fake: "skip-test", expected: "FAILED", reasons: [`D2:skipped:${M}`, "D4:out_of_contract:tests/**", `MUST_PASS:not_passed:${M}`] },
  { id: "B3", fake: "delete-test", expected: "FAILED", reasons: [`D2:missing_test:${M}`, "D4:out_of_contract:tests/**"] },
  { id: "B4", fake: "delete-and-add-empty", expected: "FAILED", reasons: [`D2:missing_test:${M}`, "D4:out_of_contract:tests/**"] },
  { id: "B5", fake: "echo-pass", expected: "UNKNOWN", reasons: ["D3:protected_field:package.json#scripts"] },
  { id: "B6", fake: "out-of-contract", expected: "FAILED", reasons: ["D4:out_of_contract:scripts/**"] },
  { id: "B7", fake: "partial-fix", expected: "FAILED", reasons: ["D1:regression:tests/cart.spec.ts > cart > no discount at exactly 50"] },
  { id: "B8", fake: "it-only", expected: "FAILED", reasons: ["D2:only:tests/cart.spec.ts", "D4:out_of_contract:tests/**"] },
];
