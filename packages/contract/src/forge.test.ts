import { describe, expect, it } from "vitest";
import { pushFromGitHub, pushFromGitLab } from "./forge.js";

// E9f (D-660): a push webhook of either forge becomes one ForgePush; anything else is rejected at the border.
const A = "a".repeat(40);
const B = "b".repeat(40);

describe("ForgePush (D-660)", () => {
  it("GitHub push → repo, branch, the commits (id + message only)", () => {
    const p = pushFromGitHub({ ref: "refs/heads/main", before: A, after: B, deleted: false, repository: { full_name: "simo/shop", id: 1 }, commits: [{ id: B, message: "Revert \"x\"\n\nThis reverts commit " + A + ".", timestamp: "2026-11-26T10:00:00Z", tree_id: A, author: { name: "x" } }] });
    expect(p).toEqual({ forge: "github", repo: "simo/shop", branch: "main", after: B, commits: [{ sha: B, message: `Revert "x"\n\nThis reverts commit ${A}.` }] });
  });
  it("GitLab push hook → the same shape", () => {
    const p = pushFromGitLab({ object_kind: "push", ref: "refs/heads/main", before: A, after: B, project: { path_with_namespace: "simo/shop" }, commits: [{ id: B, message: "m", timestamp: "2026-11-26T10:00:00+00:00" }] });
    expect(p).toEqual({ forge: "gitlab", repo: "simo/shop", branch: "main", after: B, commits: [{ sha: B, message: "m" }] });
  });
  it("a tag push, a branch deletion, a bad sha or a bad repo → null", () => {
    expect(pushFromGitHub({ ref: "refs/tags/v1", before: A, after: B, repository: { full_name: "a/b" }, commits: [] })).toBeNull();
    expect(pushFromGitHub({ ref: "refs/heads/main", before: A, after: "0".repeat(40), deleted: true, repository: { full_name: "a/b" }, commits: [] })).toBeNull();
    expect(pushFromGitHub({ ref: "refs/heads/main", before: A, after: "nope", repository: { full_name: "a/b" }, commits: [] })).toBeNull();
    expect(pushFromGitHub({ ref: "refs/heads/main", before: A, after: B, repository: { full_name: "../etc" }, commits: [] })).toBeNull();
    expect(pushFromGitLab({ object_kind: "tag_push", ref: "refs/tags/v1", before: A, after: B, project: { path_with_namespace: "a/b" }, commits: [] })).toBeNull();
    expect(pushFromGitHub("not an object")).toBeNull();
  });
  it("a commit message is cut to 64 KiB; more than 2048 commits → null (GitHub caps the array at 2048)", () => {
    const p = pushFromGitHub({ ref: "refs/heads/main", before: A, after: B, repository: { full_name: "a/b" }, commits: [{ id: B, message: "x".repeat(70_000) }] });
    expect(p?.commits[0]?.message.length).toBe(65_536);
    const many = Array.from({ length: 2049 }, () => ({ id: B, message: "m" }));
    expect(pushFromGitHub({ ref: "refs/heads/main", before: A, after: B, repository: { full_name: "a/b" }, commits: many })).toBeNull();
  });
});
