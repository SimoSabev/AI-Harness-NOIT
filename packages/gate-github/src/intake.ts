import type { PullInfo } from "./port.js";

// Демо промпт т. 6.4 (S11–S14, D-237): where a PR comes from and whether Mandat checks it automatically.

export type Origin = "mandat" | "external_pr";
export interface KnownHead {
  head_sha: string;
  head_ref: string;
}

/**
 * origin = 'mandat' ONLY if the author is the Writer App AND a task/changeset (or harness proposal) of Mandat has this
 * exact head_sha with the head_ref `mandat/<task_id>-a<attempt>` (`mandat/harness-<id>`). The branch name alone never
 * decides. A `mandat/*` branch from anyone else → external + security event branch_namespace_spoof.
 */
export function originOf(p: PullInfo, o: { writerAppId: number; known: KnownHead[] }): { origin: Origin; spoof: boolean } {
  const byWriter = p.author_app_id !== null && p.author_app_id === o.writerAppId;
  const ours = byWriter && o.known.some((k) => k.head_sha === p.head_sha && k.head_ref === p.head_ref) && /^mandat\/(t_[a-z0-9_]{1,40}-a\d+|harness-[0-9a-f-]{36})$/.test(p.head_ref);
  if (ours) return { origin: "mandat", spoof: false };
  return { origin: "external_pr", spoof: p.head_ref.startsWith("mandat/") };
}

export const AUTO_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
export const LIMITS = Object.freeze({ perPull: 1, global: 2, perRepoHour: 20, retryMinutes: 10 });

export type IntakeDecision =
  | { kind: "verify" }
  | { kind: "check_only"; title: string; reason: "base_not_protected" | "needs_approval" | "rate_limited" };

export interface QueueState {
  activeGlobal: number;
  activeForPull: number;
  startedLastHourForRepo: number;
}

export function intakeDecision(p: PullInfo, o: { defaultBranch: string; externalAgents: number[]; approvedByHuman: boolean; queue: QueueState }): IntakeDecision {
  if (p.base_ref !== o.defaultBranch) return { kind: "check_only", reason: "base_not_protected", title: "UNKNOWN: POLICY:base_not_protected" };
  const trusted = AUTO_ASSOCIATIONS.has(p.author_association) || o.externalAgents.includes(p.author_id) || o.approvedByHuman;
  if (!trusted) return { kind: "check_only", reason: "needs_approval", title: "чака одобрение за проверка" };
  // a newer synchronize replaces the active check of the same PR (the caller cancels it), so only the global/hourly caps apply here
  if (o.queue.activeGlobal - o.queue.activeForPull >= LIMITS.global || o.queue.startedLastHourForRepo >= LIMITS.perRepoHour) {
    return { kind: "check_only", reason: "rate_limited", title: "UNKNOWN: rate_limited (нов опит след 10 мин)" };
  }
  return { kind: "verify" };
}

/** External check runs: external_id = ext:<owner/repo>#<n>@<head_sha[0:12]> (D-230). */
export const externalId = (repo: string, n: number, headSha: string): string => `ext:${repo}#${n}@${headSha.slice(0, 12)}`;
