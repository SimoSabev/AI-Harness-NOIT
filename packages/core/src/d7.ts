import type { Evidence } from "@mandat/contract";
import { ev } from "./evidence.js";

// Демо промпт т. 6.4 D7.ci lite (S24, F23): the other CI of head_sha. Mandat's own checks are excluded by app_id
// (never by name). D7.ci never blocks the verdict on its own: pending → unknown, a red CI → fail.
export interface CheckRunInfo {
  name: string;
  status: string;
  conclusion: string | null;
  app_id: number;
}
export interface CommitStatusInfo {
  context: string;
  state: "error" | "failure" | "pending" | "success";
  creator_id: number;
}

const GREEN = new Set(["success", "neutral", "skipped"]);

export function d7ci(i: { checkRuns: CheckRunInfo[]; statuses: CommitStatusInfo[]; ownAppIds: number[]; timedOut?: boolean }): { evidence: Evidence; status: "pass" | "fail" | "unknown" } {
  const runs = i.checkRuns.filter((c) => !i.ownAppIds.includes(c.app_id));
  // The latest status per context wins (GitHub returns newest first).
  const latest = new Map<string, CommitStatusInfo>();
  for (const s of i.statuses) if (!latest.has(s.context)) latest.set(s.context, s);
  const sts = [...latest.values()];
  const failedRun = runs.find((c) => c.status === "completed" && !GREEN.has(c.conclusion ?? ""));
  const failedSt = sts.find((s) => s.state === "failure" || s.state === "error");
  if (failedRun || failedSt) {
    const name = failedRun?.name ?? failedSt?.context ?? "-";
    return { evidence: ev("D7.ci", "fail", `CI failed: ${name}`, { checks: runs.length, statuses: sts.length }, { cls: "ci_check_failed", id: name }), status: "fail" };
  }
  const pending = runs.some((c) => c.status !== "completed") || sts.some((s) => s.state === "pending");
  if (pending || (runs.length === 0 && sts.length === 0)) {
    const why = i.timedOut ? "ci_timeout" : runs.length === 0 && sts.length === 0 ? "ci_none" : "ci_pending";
    return { evidence: ev("D7.ci", "unknown", why === "ci_none" ? "no CI signal for head" : "CI pending", { checks: runs.length, statuses: sts.length }, { cls: why === "ci_none" ? "ci_pending" : why, id: "-" }), status: "unknown" };
  }
  return { evidence: ev("D7.ci", "pass", `${runs.length} check(s), ${sts.length} status(es) green`, { checks: runs.length, statuses: sts.length }), status: "pass" };
}
