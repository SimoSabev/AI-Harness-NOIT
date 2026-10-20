import type { CheckRunInput, GitHubPort } from "./port.js";

// T3-2: outbox rows → GitHub calls. Each handler is idempotent: check runs are found/updated by external_id + name +
// head_sha; refs are create-if-absent; ready/merge are safe to repeat (GitHub answers 405/409 on the second merge).
export interface GitHubEffectPayload {
  repo: string;
  check?: CheckRunInput;
  number?: number;
  sha?: string;
}
export type EffectRow = { kind: string; idempotency_key: string; payload: Record<string, unknown> };

export function githubEffectHandlers(gh: GitHubPort): Record<"check_run" | "approval_check" | "ready_for_review" | "merge", (row: EffectRow) => Promise<void>> {
  const p = (row: EffectRow) => row.payload as unknown as GitHubEffectPayload;
  return {
    check_run: async (row) => {
      const x = p(row);
      if (!x.check) throw new Error("check_run without check");
      await gh.createOrUpdateCheckRun(x.repo, x.check);
    },
    approval_check: async (row) => {
      const x = p(row);
      if (!x.check) throw new Error("approval_check without check");
      await gh.createOrUpdateCheckRun(x.repo, x.check);
    },
    ready_for_review: async (row) => {
      const x = p(row);
      if (x.number === undefined) throw new Error("ready_for_review without number");
      await gh.markReadyForReview(x.repo, x.number);
    },
    merge: async (row) => {
      const x = p(row);
      if (x.number === undefined || !x.sha) throw new Error("merge without number/sha");
      const r = await gh.mergePull(x.repo, x.number, { sha: x.sha, merge_method: "squash" });
      if (!r.ok && r.status !== 405) throw new Error(`merge ${r.status}`);
    },
  };
}
