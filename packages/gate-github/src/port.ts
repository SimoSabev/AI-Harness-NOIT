// Демо промпт т. 6.1 — the GitHub port of the gate. The fake (fake.ts) and the Octokit adapter (octokit.ts) implement it.
export interface PullInfo {
  number: number;
  head_sha: string;
  head_ref: string;
  base_ref: string;
  base_sha: string;
  author_login: string;
  author_id: number;
  author_type: "User" | "Bot";
  author_app_id: number | null;
  author_association: string;
  draft: boolean;
  head_repo_full_name: string;
  title: string;
  body: string | null;
}
export interface RulesInfo {
  strict: boolean;
  requiredContexts: string[];
  mergeQueue: boolean;
  /** integration_id per required context (Writer App), when the ruleset pins it */
  integrationIds?: Record<string, number>;
}
export type CheckName = "Мандат verdict" | "Мандат approval" | "Мандат harness";
export const CHECK_NAMES: readonly CheckName[] = ["Мандат verdict", "Мандат approval", "Мандат harness"];
export type CheckConclusion = "success" | "failure" | "action_required" | "skipped";
export interface CheckRunInput {
  name: CheckName;
  head_sha: string;
  external_id: string;
  conclusion: CheckConclusion;
  title: string;
  summary: string;
  details_url?: string;
}
export type MergeResult = { ok: true; merge_commit_sha: string } | { ok: false; status: 405 | 409 | 422 | 403 | 404; message: string };

export interface GitHubPort {
  getPull(repo: string, n: number): Promise<PullInfo>;
  listOpenPulls(repo: string): Promise<PullInfo[]>;
  getRules(repo: string, branch: string): Promise<RulesInfo>;
  createOrUpdateCheckRun(repo: string, i: CheckRunInput): Promise<{ id: number; created: boolean }>;
  createRefIfAbsent(repo: string, i: { ref: string; sha: string }): Promise<{ ok: true } | { ok: false; reason: "ref_exists" }>;
  createCommit(repo: string, i: { treeFromDiff: Buffer; parentSha: string; message: string }): Promise<{ commitSha: string; treeSha: string }>;
  createPull(repo: string, i: { head: string; base: string; title: string; body: string; draft: boolean }): Promise<{ number: number; url: string }>;
  markReadyForReview(repo: string, n: number): Promise<void>;
  mergePull(repo: string, n: number, i: { sha: string; merge_method: "squash" }): Promise<MergeResult>;
  getCommitTreeSha(repo: string, sha: string): Promise<string>;
  listCheckRunsForRef(repo: string, sha: string): Promise<{ name: string; status: string; conclusion: string | null; app_id: number; app_slug: string }[]>;
  listCommitStatusesForRef(repo: string, sha: string): Promise<{ context: string; state: "error" | "failure" | "pending" | "success"; creator_id: number }[]>;
  fetchPullHead(repo: string, n: number, mirrorPath: string): Promise<{ head_sha: string }>;
}
