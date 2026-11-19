import { describe, expect, it } from "vitest";
import { lineage } from "./lineage.js";
import type { LineageTrial, LineageVersion } from "./lineage.js";

// D-551: the chain of a profile's versions from the current one back to the first, each with how it came and the
// evidence behind it (the change, the failure class, the bench before and after, the held-out counts).
const v = (id: string, version: number, parent: string | null, origin: LineageVersion["origin"], trial: string | null = null): LineageVersion => ({ id, version, parent_id: parent, origin, trial_id: trial, status: "superseded", profile_hash: `sha256:${String(version).repeat(64).slice(0, 64)}` });
const t = (id: string, rule: string, status: string): LineageTrial => ({ id, manifest: { change: { rule, layer: "b", detail: "" }, reason_class: "D2:missing_test", evidence: ["t_a", "t_b", "t_c"] }, status, bench: { before: { pass: 9, total: 10, false_verified: 0, heldout: { pass: 7, total: 8, false_verified: 0 } }, after: { pass: 10, total: 10, false_verified: 0, heldout: { pass: 8, total: 8, false_verified: 0 } } }, why: "held" });

describe("lineage (D-551)", () => {
  it("walks from the current version to the first, with the change and the bench of each step", () => {
    const versions = [v("p1", 1, null, "person"), v("p2", 2, "p1", "evolve", "tr1"), { ...v("p3", 3, "p2", "evolve_rollback", "tr1"), status: "approved" as const }];
    const out = lineage("p3", versions, [t("tr1", "tests_kept", "rolled_back")]);
    expect(out.map((x) => [x.version, x.origin])).toEqual([[3, "evolve_rollback"], [2, "evolve"], [1, "person"]]);
    expect(out[1]).toMatchObject({ change: "tests_kept", reason_class: "D2:missing_test", evidence: 3, bench: { before: "9/10", after: "10/10", heldout_before: "7/8", heldout_after: "8/8" }, trial_status: "rolled_back" });
    expect(out[2]).toMatchObject({ change: null, bench: null });
  });
  it("a loop or a missing parent ends the walk; at most 200 steps", () => {
    expect(lineage("a", [v("a", 2, "b", "evolve"), v("b", 1, "a", "evolve")], []).map((x) => x.version)).toEqual([2, 1]);
    expect(lineage("a", [v("a", 2, "gone", "evolve")], []).map((x) => x.version)).toEqual([2]);
    expect(lineage("none", [], [])).toEqual([]);
  });
});
