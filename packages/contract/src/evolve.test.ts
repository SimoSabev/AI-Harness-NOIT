import { describe, expect, it } from "vitest";
import { EVOLVE_LIMITS, LedgerKind, ProfileChange, ProfileManifest, ProfileTrialStatus } from "./index.js";

// Round 2, profile evolution with evidence (D-530, approved by Simo 16.11.2026): a recurring failure class becomes a
// proposed change of the harness profile with a manifest — the evidence and a prediction that the next tasks falsify.
describe("evolve contract (D-530)", () => {
  const manifest = {
    change: { rule: "protect_path", layer: "c", detail: "infra/**" },
    evidence: ["t_a", "t_b", "t_c"],
    reason_class: "D4:out_of_contract",
    prediction: { task_type: "bugfix", next_n: 10, max_repeats: 0 },
  };

  it("a manifest names the change, at least three tasks of evidence, the class and a falsifiable prediction", () => {
    expect(ProfileManifest.parse(manifest)).toEqual(manifest);
    expect(() => ProfileManifest.parse({ ...manifest, evidence: ["t_a", "t_b"] })).toThrow();
    expect(() => ProfileManifest.parse({ ...manifest, prediction: { ...manifest.prediction, next_n: 0 } })).toThrow();
    expect(() => ProfileManifest.parse({ ...manifest, extra: 1 })).toThrow();
    expect(EVOLVE_LIMITS.min_evidence).toBe(3);
  });

  it("a change is one of the fixed narrowing rules; a path glob has no invisible or control characters", () => {
    expect(ProfileChange.parse({ rule: "tests_kept", layer: "b", detail: "" }).rule).toBe("tests_kept");
    expect(() => ProfileChange.parse({ rule: "allow_all", layer: "c", detail: "" })).toThrow();
    expect(() => ProfileChange.parse({ rule: "protect_path", layer: "c", detail: "infra/**​" })).toThrow();
    expect(() => ProfileChange.parse({ rule: "protect_path", layer: "c", detail: "a\nb" })).toThrow();
  });

  it("a trial moves proposed → benched → accepted / refused, and an accepted one may be rolled back; the ledger knows it", () => {
    expect(ProfileTrialStatus.options).toEqual(["proposed", "benched", "accepted", "refused", "rolled_back"]);
    expect(LedgerKind.parse("profile_trial")).toBe("profile_trial");
  });
});
