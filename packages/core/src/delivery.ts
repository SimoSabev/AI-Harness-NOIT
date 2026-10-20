import type { VerdictResult, VerifyMode } from "@mandat/contract";

// Демо промпт т. 6.3 / спец. т. 8: what the gate does with a verdict at a given effective level. Pure.
export type WaitReason = "unknown" | "risk_cap" | "level_up" | "ruleset_missing" | "d7_missing" | "merge_blocked";
export type DeliveryAction =
  | { kind: "none" }
  | { kind: "branch_only" }
  | { kind: "draft_pr" }
  | { kind: "pr_then_auto_merge"; notify: boolean }
  | { kind: "hold"; wait_reason: WaitReason };

export function decideDelivery(i: { result: VerdictResult; effectiveLevel: 0 | 1 | 2 | 3; mode: VerifyMode; origin: "mandat" | "external_pr" }): DeliveryAction {
  // An external PR already exists: Mandat only posts its check run, never a branch/PR/ready/merge.
  if (i.origin === "external_pr" || i.mode === "external") return { kind: "none" };
  if (i.result === "FAILED") return { kind: "none" };
  if (i.result === "UNKNOWN") return { kind: "hold", wait_reason: "unknown" };
  switch (i.effectiveLevel) {
    case 0:
      return { kind: "branch_only" };
    case 1:
      return { kind: "draft_pr" };
    case 2:
      return { kind: "pr_then_auto_merge", notify: true };
    case 3:
      return { kind: "pr_then_auto_merge", notify: false };
  }
}

/** After VERIFY_2 (D7 for head_sha): level ≥ 2 merges; ≤ 1 holds with the reason that capped it (т. 6.3). */
export function afterVerify2(i: { level: 0 | 1 | 2 | 3; reasons: string[] }): { kind: "merge" } | { kind: "hold"; wait_reason: WaitReason } {
  if (i.level >= 2) return { kind: "merge" };
  if (i.reasons.includes("d7_missing")) return { kind: "hold", wait_reason: "d7_missing" };
  if (i.reasons.includes("ruleset_missing")) return { kind: "hold", wait_reason: "ruleset_missing" };
  if (i.reasons.includes("unknown")) return { kind: "hold", wait_reason: "unknown" };
  if (i.reasons.includes("risk_cap")) return { kind: "hold", wait_reason: "risk_cap" };
  return { kind: "hold", wait_reason: "level_up" };
}
