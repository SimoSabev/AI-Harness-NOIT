import { describe, expect, it } from "vitest";
import { afterVerdict, nightReport, proposalFor, unsolvable, whatStopped } from "./night-rules.js";

// v5 E9а (2.4 / D-320): the night shift never stops on one task — a verdict decides retry, park or done; a park carries
// a question in human words with a deterministic proposal; only the budget or a security incident stops the shift.
describe("night rules (E9а)", () => {
  it("нерешимо: POLICY:*, INFRA:*, HELD без човек, конфликт, липсващ ресурс", () => {
    expect(unsolvable(["POLICY:base_untrusted:no_remote"])).toBe(true);
    expect(unsolvable(["INFRA:INSTALL_BASE:-"])).toBe(true);
    expect(unsolvable(["HELD:ask:bash:npm view *"])).toBe(true);
    expect(unsolvable(["HELD:conflict:src/cart.ts"])).toBe(true);
    expect(unsolvable(["E_KEY_MISSING"])).toBe(true);
    expect(unsolvable(["D4:out_of_contract:infra/**"])).toBe(false);
    expect(unsolvable(["MUST_PASS:not_passed:tests/cart.spec.ts > cart > applies 10% over 50"])).toBe(false);
  });

  it("след присъда: VERIFIED → done (merged до нивото и редовете, иначе waiting); провал → retry до rules.retries; после или при нерешимо → park", () => {
    const rules = { retries: 1, auto_merge: { min_level: 2, max_lines: 200 } };
    expect(afterVerdict({ result: "VERIFIED", reasons: [] }, { attempt: 1, level: 2, lines: 40 }, rules)).toEqual({ action: "done", status: "merged" });
    expect(afterVerdict({ result: "VERIFIED", reasons: [] }, { attempt: 1, level: 1, lines: 40 }, rules)).toEqual({ action: "done", status: "waiting" });
    expect(afterVerdict({ result: "VERIFIED", reasons: [] }, { attempt: 1, level: 3, lines: 500 }, rules)).toEqual({ action: "done", status: "waiting" });
    expect(afterVerdict({ result: "FAILED", reasons: ["MUST_PASS:not_passed:x"] }, { attempt: 1, level: 0, lines: 0 }, rules)).toEqual({ action: "retry" });
    expect(afterVerdict({ result: "FAILED", reasons: ["MUST_PASS:not_passed:x"] }, { attempt: 2, level: 0, lines: 0 }, rules)).toEqual({ action: "park" });
    expect(afterVerdict({ result: "UNKNOWN", reasons: ["INFRA:INSTALL_BASE:-"] }, { attempt: 1, level: 0, lines: 0 }, rules)).toEqual({ action: "park" });
    expect(afterVerdict({ result: "UNKNOWN", reasons: ["D3:protected_path:.github/**"] }, { attempt: 1, level: 0, lines: 0 }, { ...rules, retries: 0 })).toEqual({ action: "park" });
  });

  it("предложение по клас — детерминистично, без текст от агента", () => {
    expect(proposalFor(["D4:out_of_contract:infra/**"])).toBe("Add infra/** to allowed_paths of this task type, or narrow the task so it stays inside the contract.");
    expect(proposalFor(["D2:missing_test:tests/cart.spec.ts > cart > adds"])).toContain("tests/cart.spec.ts > cart > adds");
    expect(proposalFor(["D10:lock_missing:left-pad"])).toContain("left-pad");
    expect(proposalFor(["INFRA:INSTALL_BASE:-"])).toContain("mandat doctor");
    expect(proposalFor(["something:new"])).toBe("Read the verdict on the card and decide; Mandat has no rule for this reason yet.");
  });

  it("какво спря — с човешки думи, причините в code span, ≤ 1000 знака", () => {
    const w = whatStopped({ result: "FAILED", reasons: ["MUST_PASS:not_passed:tests/cart.spec.ts > cart > applies 10% over 50", "D4:out_of_contract:infra/**"] }, 2);
    expect(w).toBe("FAILED after 2 attempt(s): `MUST_PASS:not_passed:tests/cart.spec.ts > cart > applies 10% over 50`, `D4:out_of_contract:infra/**`");
    expect(whatStopped({ result: "UNKNOWN", reasons: Array.from({ length: 200 }, (_, i) => `D3:protected_path:p${i}/**`) }, 1).length).toBeLessThanOrEqual(1000);
  });

  it("сутрешен доклад: броене по статус, разход, научено", () => {
    const r = nightReport([{ status: "merged" }, { status: "merged" }, { status: "waiting" }, { status: "parked" }, { status: "failed" }, { status: "skipped" }], 3.456, ["D4 blocks infra/** on shop"]);
    expect(r).toEqual({ merged: 2, waiting: 1, parked: 1, failed: 1, skipped: 1, spent_usd: 3.46, learned: ["D4 blocks infra/** on shop"] });
  });
});
