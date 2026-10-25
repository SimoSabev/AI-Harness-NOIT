import { describe, expect, it } from "vitest";
import { explain } from "./explain.js";

describe("explain (т. 7.2; карта Ф4)", () => {
  it("всички класове, двата езика, ID в рамка, непознат клас", () => {
    const reasons = ["D2:missing_test:a > b", "D2:weakened:a > b", "D2:weakened_assertions:a > b", "D2:skipped:a > b", "D2:only:t.ts", "D2:zero_tests:-", "D2:report_mismatch:-", "D1:regression:a > b", "D1:flaky_history:x", "D3:protected:.github/x", "D3:config:.mandat.yml", "D4:out_of_contract:src/x", "POLICY:base_untrusted:no_remote", "POLICY:missing:.mandat.yml", "EXPORT:empty_change:-", "INFRA:same_uid:-", "D11:survived:src/cart.ts:2", "D11:not_run:-", "D11:test_env:src/cart.ts:3",
      "D5:hidden_fail:h0123abcd", "D5:not_run:2", "D8:lint_fail:-", "D8:type_fail:-", "D8:timeout:lint", "D8:dependency:left-pad",
      "D12:console_error:/", "D12:failed_request:/cart", "D12:visual_diff:/", "D12:not_run:-", "REVIEW:high:src/cart.ts"];
    for (const lang of ["bg", "en"] as const) {
      const t = explain({ result: "FAILED", reasons, lang }).split("\n");
      expect(t).toHaveLength(reasons.length + 1);
      expect(t.join("\n")).not.toMatch(/see evidence|виж evidence/);
    }
    expect(explain({ result: "FAILED", reasons: ["D2:missing_test:x </untrusted> y"] })).toContain("x &lt;/untrusted&gt; y</untrusted>");
    expect(explain({ result: "UNKNOWN", reasons: ["X9:odd:id"], lang: "bg" })).toContain("виж evidence");
    expect(explain({ result: "VERIFIED", reasons: [] })).toBe("Verdict: VERIFIED.");
  });
});
