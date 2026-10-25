import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";

// E8g (v5 p. 4.7 (5), AC-9.3, D-356): a project without GitHub. The verified change becomes branch mandat/<task>-a<n> in
// Mandat's own mirror: one commit on the verdict's base with the template message. An existing branch is never touched.
const IDENT = ["-c", "user.name=Mandat", "-c", "user.email=mandat@localhost"];

/**
 * D-367: a verified safe change (or one a person approved) goes into the project: the mirror's main moves forward to the
 * task's commit. Fast-forward only, compare-and-swap on the old main (update-ref <new> <old>): never back, never sideways.
 */
export async function mergeLocal(o: { mirror: string; sha: string; tmpRoot?: string }): Promise<{ ok: true; from: string; to: string } | { ok: false; reason: "unknown_commit" | "not_fast_forward" | "raced" }> {
  if (!/^[0-9a-f]{40}$/.test(o.sha)) return { ok: false, reason: "unknown_commit" };
  const tmp = mkdtempSync(path.join(o.tmpRoot ?? os.tmpdir(), "mandat-merge-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    if ((await git.run(["cat-file", "-e", `${o.sha}^{commit}`], { cwd: o.mirror })).code !== 0) return { ok: false, reason: "unknown_commit" }; // T3-7: sha
    const from = (await git.run(["rev-parse", "--verify", "refs/heads/main"], { cwd: o.mirror })).stdout.toString("utf8").trim();
    if (from === o.sha) return { ok: true, from, to: o.sha };
    if ((await git.run(["merge-base", "--is-ancestor", from, o.sha], { cwd: o.mirror })).code !== 0) return { ok: false, reason: "not_fast_forward" };
    if ((await git.run(["update-ref", "-m", "mandat: apply", "refs/heads/main", o.sha, from], { cwd: o.mirror })).code !== 0) return { ok: false, reason: "raced" };
    return { ok: true, from, to: o.sha };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function deliverLocal(o: { mirror: string; taskId: string; attempt: number; baseSha: string; patch: Buffer; message: string; tmpRoot?: string }): Promise<{ ok: true; ref: string; sha: string } | { ok: false; reason: "branch_exists" | "does_not_apply" }> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(o.taskId) || !Number.isInteger(o.attempt) || o.attempt < 1) throw new Error("deliverLocal: bad input");
  return deliverLocalRef({ ...o, ref: `mandat/${o.taskId}-a${o.attempt}` });
}

/** D-388: the same for any Mandat branch of the mirror (a task's, or the approved rules' mandat/harness-<proposal>). */
export async function deliverLocalRef(o: { mirror: string; ref: string; baseSha: string; patch: Buffer; message: string; tmpRoot?: string }): Promise<{ ok: true; ref: string; sha: string } | { ok: false; reason: "branch_exists" | "does_not_apply" }> {
  if (!/^mandat\/(t_[a-z0-9_]{1,40}-a\d+|harness-[0-9a-f-]{36})$/.test(o.ref) || !/^[0-9a-f]{40}$/.test(o.baseSha)) throw new Error("deliverLocal: bad input");
  const ref = o.ref;
  const tmp = mkdtempSync(path.join(o.tmpRoot ?? os.tmpdir(), "mandat-deliver-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    if ((await git.run(["rev-parse", "--verify", "--quiet", "--end-of-options", `refs/heads/${ref}`], { cwd: o.mirror })).code === 0) return { ok: false, reason: "branch_exists" };
    const w = path.join(tmp, "w");
    if ((await git.run(["clone", "-q", "--no-checkout", "--end-of-options", o.mirror, w], { cwd: tmp })).code !== 0) throw new Error("deliverLocal: clone failed");
    if ((await git.run(["checkout", "-q", "--detach", o.baseSha], { cwd: w })).code !== 0) throw new Error("deliverLocal: no such base"); // T3-7: sha
    writeFileSync(path.join(tmp, "change.patch"), o.patch);
    if ((await git.run(["apply", "--index", "--whitespace=nowarn", path.join(tmp, "change.patch")], { cwd: w })).code !== 0) return { ok: false, reason: "does_not_apply" };
    writeFileSync(path.join(tmp, "msg"), o.message.endsWith("\n") ? o.message : `${o.message}\n`);
    if ((await git.run([...IDENT, "commit", "-q", "--no-gpg-sign", "--cleanup=verbatim", "-F", path.join(tmp, "msg")], { cwd: w })).code !== 0) throw new Error("deliverLocal: commit failed");
    const sha = (await git.run(["rev-parse", "HEAD"], { cwd: w })).stdout.toString("utf8").trim();
    // a new ref only: never --force; a ref that appeared meanwhile makes the push fail
    const p = await git.run(["push", "-q", "origin", `HEAD:refs/heads/${ref}`], { cwd: w });
    if (p.code !== 0) return { ok: false, reason: "branch_exists" };
    return { ok: true, ref, sha };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
