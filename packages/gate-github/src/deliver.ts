import type { Verdict, VerifyMode } from "@mandat/contract";
import type { DeliveryAction } from "@mandat/core";
import type { GitHubPort } from "./port.js";
import { renderCheck } from "./render.js";
import { commitMessage, prBody, prTitle } from "./templates.js";

// Демо промпт т. 6.3 — what the Writer App does per level. Every call here is idempotent by its key, so the worker can
// run it from the outbox (T3-2). CAS (D-235): every attempt writes a NEW ref; an existing ref → BLOCKED.

export const branchFor = (taskId: string, attempt: number): string => `mandat/${taskId}-a${attempt}`;

export interface DeliverInput {
  repo: string;
  base: string; // default branch name
  task_id: string;
  attempt: number;
  base_sha: string;
  tree_sha: string;
  diffPatch: Buffer;
  verdict: Verdict;
  effectiveLevel: 0 | 1 | 2 | 3;
  levelReasons: string[];
  ledgerSeq: number | null;
  mode: VerifyMode;
  appUrl?: string | null;
  /** E8g (D-356): the task for the commit message and the PR text (absent → the short E1 texts) */
  task?: { type: string; text: string };
  /** the project's setting; none by default */
  coAuthors?: readonly string[];
}
export type DeliverOutcome =
  | { kind: "none" }
  | { kind: "held"; wait_reason: string }
  | { kind: "blocked"; reason: "branch_changed_by_human" }
  | { kind: "branch"; ref: string; head_sha: string }
  | { kind: "pr"; ref: string; head_sha: string; number: number; draft: boolean; auto_merge: boolean; notify: boolean };

export async function deliver(gh: GitHubPort, i: DeliverInput, action: DeliveryAction): Promise<DeliverOutcome> {
  if (action.kind === "none") return { kind: "none" };
  if (action.kind === "hold") return { kind: "held", wait_reason: action.wait_reason };
  const message = i.task ? commitMessage({ type: i.task.type, text: i.task.text, taskId: i.task_id, verdict: i.verdict, ledgerSeq: i.ledgerSeq, ...(i.coAuthors ? { coAuthors: i.coAuthors } : {}) }) : `mandat: ${i.task_id} (attempt ${i.attempt})`;
  const c = await gh.createCommit(i.repo, { treeFromDiff: i.diffPatch, parentSha: i.base_sha, message });
  const ref = branchFor(i.task_id, i.attempt);
  const created = await gh.createRefIfAbsent(i.repo, { ref: `refs/heads/${ref}`, sha: c.commitSha });
  if (!created.ok) return { kind: "blocked", reason: "branch_changed_by_human" };
  if (action.kind === "branch_only") return { kind: "branch", ref, head_sha: c.commitSha };
  const draft = action.kind === "draft_pr";
  const title = i.task ? prTitle(i.task) : `Mandat: ${i.task_id}`;
  const body = i.task
    ? prBody({ text: i.task.text, taskId: i.task_id, diff: i.diffPatch, verdict: i.verdict, level: i.effectiveLevel, ledgerSeq: i.ledgerSeq, cardUrl: i.appUrl ? `${i.appUrl.replace(/\/$/, "")}/tasks/${i.task_id}` : null })
    : `Verdict ${i.verdict.result} · level ${i.effectiveLevel} · seq ${i.ledgerSeq ?? "-"}`;
  const pr = await gh.createPull(i.repo, { head: ref, base: i.base, title, body, draft });
  const r = renderCheck(i.verdict, { effectiveLevel: i.effectiveLevel, levelReasons: i.levelReasons, mode: i.mode, ledgerSeq: i.ledgerSeq, appUrl: i.appUrl ?? null, taskId: i.task_id });
  await gh.createOrUpdateCheckRun(i.repo, { name: "Мандат verdict", head_sha: c.commitSha, external_id: i.task_id, conclusion: r.conclusion, title: r.title, summary: r.summary, ...(r.details_url ? { details_url: r.details_url } : {}) });
  return { kind: "pr", ref, head_sha: c.commitSha, number: pr.number, draft, auto_merge: action.kind === "pr_then_auto_merge", notify: action.kind === "pr_then_auto_merge" ? action.notify : true };
}

/** Level 1 (and external PRs after a human approved in Mandat): ready for review + „Мандат approval“; a HUMAN merges. */
export async function humanApproved(gh: GitHubPort, i: { repo: string; number: number; head_sha: string; task_id: string; approvedBy: string; external: boolean }): Promise<void> {
  if (!i.external) await gh.markReadyForReview(i.repo, i.number);
  await gh.createOrUpdateCheckRun(i.repo, { name: "Мандат approval", head_sha: i.head_sha, external_id: i.task_id, conclusion: "success", title: "approved", summary: `approved in Mandat by ${i.approvedBy}` });
}

export type MergeOutcome =
  | { kind: "merged"; merge_commit_sha: string; tree_match: boolean }
  | { kind: "mixed"; reason: "head_moved" } // 409 → a new VERIFY for the new head; never merge without one
  | { kind: "held"; wait_reason: "base_moved" | "merge_blocked"; message?: string };

/** Level ≥ 2 after VERIFY_2 for exactly head_sha: approval check, base still current, merge with sha = head_sha. */
export async function autoMerge(gh: GitHubPort, i: { repo: string; base: string; number: number; head_sha: string; base_sha: string; tree_sha_expected: string; task_id: string; level: 2 | 3; verdictSeq: number | null; redact: (s: string) => string }): Promise<MergeOutcome> {
  const pull = await gh.getPull(i.repo, i.number);
  if (pull.head_sha !== i.head_sha) return { kind: "mixed", reason: "head_moved" };
  await gh.createOrUpdateCheckRun(i.repo, { name: "Мандат approval", head_sha: i.head_sha, external_id: i.task_id, conclusion: "success", title: `auto: level ${i.level}`, summary: `auto: level ${i.level}, verdict seq ${i.verdictSeq ?? "-"}` });
  if (pull.base_sha !== i.base_sha) return { kind: "held", wait_reason: "base_moved" };
  const m = await gh.mergePull(i.repo, i.number, { sha: i.head_sha, merge_method: "squash" });
  if (!m.ok) {
    if (m.status === 409) return { kind: "mixed", reason: "head_moved" };
    return { kind: "held", wait_reason: "merge_blocked", message: i.redact(m.message).slice(0, 300) };
  }
  const tree = await gh.getCommitTreeSha(i.repo, m.merge_commit_sha);
  return { kind: "merged", merge_commit_sha: m.merge_commit_sha, tree_match: tree === i.tree_sha_expected };
}
