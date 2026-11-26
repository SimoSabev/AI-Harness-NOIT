import { describe, expect, it } from "vitest";
import type { ForgePush } from "@mandat/contract";
import { REVERT_WINDOW_MS, findReverts } from "./revert.js";
import type { MergedChange } from "./revert.js";

// E9f (v5 5.6, AC-9.5, D-660): which pushed commit reverts which change Mandat merged, within 7 days.
const M = "1".repeat(40);
const M2 = "2".repeat(40);
const R = "9".repeat(40);
const now = new Date("2026-11-26T12:00:00Z");
const merged: MergedChange[] = [
  { changeset_id: "cs-1", merge_sha: M, pr_number: 7, title: "fix: rounding of VAT", merged_at: "2026-11-25T12:00:00Z" },
  { changeset_id: "cs-2", merge_sha: M2, pr_number: 8, title: "docs: readme", merged_at: "2026-11-24T12:00:00Z" },
];
const push = (message: string, o: Partial<ForgePush> = {}): ForgePush => ({ forge: "github", repo: "simo/shop", branch: "main", after: R, commits: [{ sha: R, message }], ...o });
const at = { now, defaultBranch: "main", repo: "simo/shop" };

describe("findReverts (AC-9.5)", () => {
  it("`git revert` of the merge commit: „This reverts commit <merge sha>.“", () => {
    expect(findReverts(push(`Revert "fix: rounding of VAT (#7)"\n\nThis reverts commit ${M}.\n`), merged, at)).toEqual([{ changeset_id: "cs-1", revert_sha: R, signal: "reverts_commit" }]);
  });
  it("the Revert button's PR, squashed: „Reverts simo/shop#7“ in the body", () => {
    expect(findReverts(push(`Revert "fix: rounding of VAT" (#9)\n\nReverts simo/shop#7`), merged, at)).toEqual([{ changeset_id: "cs-1", revert_sha: R, signal: "revert_pr" }]);
  });
  it("a subject „Revert \"<the PR title>\"“ with or without (#n) is enough", () => {
    expect(findReverts(push('Revert "docs: readme"'), merged, at)).toEqual([{ changeset_id: "cs-2", revert_sha: R, signal: "revert_pr" }]);
    expect(findReverts(push('Revert "docs: readme (#8)"'), merged, at)).toEqual([{ changeset_id: "cs-2", revert_sha: R, signal: "revert_pr" }]);
  });
  it("not a revert: other text, another sha, another repo's #7, a revert of a revert", () => {
    expect(findReverts(push("fix: something else"), merged, at)).toEqual([]);
    expect(findReverts(push(`Revert "x"\n\nThis reverts commit ${"3".repeat(40)}.`), merged, at)).toEqual([]);
    expect(findReverts(push('Revert "x"\n\nReverts other/repo#7'), merged, at)).toEqual([]);
    expect(findReverts(push('Revert "Revert "docs: readme""'), merged, at)).toEqual([]);
    expect(findReverts(push(`mentions This reverts commit ${M}. in the middle of a line`), merged, at)).toEqual([]);
  });
  it("only the default branch and only the same repo", () => {
    expect(findReverts(push(`This reverts commit ${M}.`, { branch: "feature" }), merged, at)).toEqual([]);
    expect(findReverts(push(`This reverts commit ${M}.`, { repo: "simo/other" }), merged, at)).toEqual([]);
  });
  it("7 days from the merge, by the time it is seen (never by the commit's own date); the future is out", () => {
    const old = [{ ...merged[0], merged_at: new Date(now.getTime() - REVERT_WINDOW_MS - 1).toISOString() } as MergedChange];
    expect(findReverts(push(`This reverts commit ${M}.`), old, at)).toEqual([]);
    const edge = [{ ...merged[0], merged_at: new Date(now.getTime() - REVERT_WINDOW_MS).toISOString() } as MergedChange];
    expect(findReverts(push(`This reverts commit ${M}.`), edge, at)).toHaveLength(1);
    const future = [{ ...merged[0], merged_at: "2026-11-27T12:00:00Z" } as MergedChange];
    expect(findReverts(push(`This reverts commit ${M}.`), future, at)).toEqual([]);
  });
  it("one match per change (the first commit), the merge commit itself never counts", () => {
    const p: ForgePush = { forge: "github", repo: "simo/shop", branch: "main", after: R, commits: [
      { sha: M, message: `This reverts commit ${M}.` },
      { sha: R, message: `This reverts commit ${M}.` },
      { sha: "8".repeat(40), message: `This reverts commit ${M}.` },
    ] };
    expect(findReverts(p, merged, at)).toEqual([{ changeset_id: "cs-1", revert_sha: R, signal: "reverts_commit" }]);
  });
  it("the title alone is weak: two open changes with the same title → none; a strong signal wins over it", () => {
    const twins: MergedChange[] = [merged[0] as MergedChange, { ...(merged[0] as MergedChange), changeset_id: "cs-3", merge_sha: "3".repeat(40), pr_number: 11 }];
    expect(findReverts(push('Revert "fix: rounding of VAT"'), twins, at)).toEqual([]);
    expect(findReverts(push('Revert "fix: rounding of VAT (#11)"'), twins, at)).toEqual([{ changeset_id: "cs-3", revert_sha: R, signal: "revert_pr" }]);
    expect(findReverts(push(`Revert "fix: rounding of VAT"\n\nThis reverts commit ${"3".repeat(40)}.`), twins, at)).toEqual([{ changeset_id: "cs-3", revert_sha: R, signal: "reverts_commit" }]);
  });
  it("one commit that reverts two changes counts for both", () => {
    expect(findReverts(push(`Revert two\n\nThis reverts commit ${M}.\nThis reverts commit ${M2}.`), merged, at).map((r) => r.changeset_id)).toEqual(["cs-1", "cs-2"]);
  });
});
