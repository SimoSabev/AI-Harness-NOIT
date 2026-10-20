import { describe, expect, it } from "vitest";
import { afterVerify2, d7ci, decideDelivery } from "./index.js";

describe("gate-level (т. 6.3)", () => {
  it("таблица result × level × mode × origin", () => {
    for (const result of ["VERIFIED", "FAILED", "UNKNOWN"] as const)
      for (const effectiveLevel of [0, 1, 2, 3] as const)
        for (const mode of ["full", "external"] as const)
          for (const origin of ["mandat", "external_pr"] as const) {
            const a = decideDelivery({ result, effectiveLevel, mode, origin });
            if (origin === "external_pr" || mode === "external") expect(a).toEqual({ kind: "none" });
            else if (result === "FAILED") expect(a).toEqual({ kind: "none" });
            else if (result === "UNKNOWN") expect(a).toEqual({ kind: "hold", wait_reason: "unknown" });
            else expect(a.kind).toBe(["branch_only", "draft_pr", "pr_then_auto_merge", "pr_then_auto_merge"][effectiveLevel]);
          }
    expect(decideDelivery({ result: "VERIFIED", effectiveLevel: 2, mode: "full", origin: "mandat" })).toEqual({ kind: "pr_then_auto_merge", notify: true });
    expect(decideDelivery({ result: "VERIFIED", effectiveLevel: 3, mode: "full", origin: "mandat" })).toEqual({ kind: "pr_then_auto_merge", notify: false });
  });
  it("след VERIFY_2: ниво 2 без D7 pass → hold d7_missing; без strict → ruleset_missing", () => {
    expect(afterVerify2({ level: 2, reasons: [] })).toEqual({ kind: "merge" });
    expect(afterVerify2({ level: 1, reasons: ["d7_missing"] })).toEqual({ kind: "hold", wait_reason: "d7_missing" });
    expect(afterVerify2({ level: 1, reasons: ["ruleset_missing"] })).toEqual({ kind: "hold", wait_reason: "ruleset_missing" });
    expect(afterVerify2({ level: 1, reasons: ["unknown"] })).toEqual({ kind: "hold", wait_reason: "unknown" });
    expect(afterVerify2({ level: 0, reasons: ["risk_cap"] })).toEqual({ kind: "hold", wait_reason: "risk_cap" });
    expect(afterVerify2({ level: 1, reasons: [] })).toEqual({ kind: "hold", wait_reason: "level_up" });
  });
});

describe("D7.ci lite (S24, F23)", () => {
  const OWN = [11, 12];
  it("собствените check-ове се изключват по app_id, не по име", () => {
    const r = d7ci({ checkRuns: [{ name: "test", status: "completed", conclusion: "success", app_id: 15368 }, { name: "Мандат verdict", status: "completed", conclusion: "failure", app_id: 11 }], statuses: [], ownAppIds: OWN });
    expect(r.status).toBe("pass");
    const fake = d7ci({ checkRuns: [{ name: "Мандат verdict", status: "completed", conclusion: "failure", app_id: 999 }], statuses: [], ownAppIds: OWN });
    expect(fake.evidence.signature).toBe("D7:ci_check_failed:Мандат verdict");
  });
  it("pending → unknown D7:ci_pending:-; няма CI → unknown; statuses (най-новият печели)", () => {
    expect(d7ci({ checkRuns: [{ name: "t", status: "in_progress", conclusion: null, app_id: 1 }], statuses: [], ownAppIds: OWN }).evidence.signature).toBe("D7:ci_pending:-");
    expect(d7ci({ checkRuns: [], statuses: [], ownAppIds: OWN }).status).toBe("unknown");
    expect(d7ci({ checkRuns: [], statuses: [{ context: "ci/x", state: "success", creator_id: 1 }, { context: "ci/x", state: "failure", creator_id: 1 }], ownAppIds: OWN }).status).toBe("pass");
    expect(d7ci({ checkRuns: [], statuses: [{ context: "ci/x", state: "error", creator_id: 1 }], ownAppIds: OWN }).evidence.signature).toBe("D7:ci_check_failed:ci/x");
    expect(d7ci({ checkRuns: [{ name: "t", status: "queued", conclusion: null, app_id: 1 }], statuses: [], ownAppIds: OWN, timedOut: true }).evidence.signature).toBe("D7:ci_timeout:-");
    expect(d7ci({ checkRuns: [{ name: "lint", status: "completed", conclusion: "skipped", app_id: 1 }, { name: "t", status: "completed", conclusion: "neutral", app_id: 1 }], statuses: [], ownAppIds: OWN }).status).toBe("pass");
  });
});
