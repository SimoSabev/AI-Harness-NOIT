import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";

// E8g (v5 p. 4.7 (5), AC-9.3, D-356, T3-7): `mandat apply --task <id>` brings Mandat's branch for the task (the latest
// attempt) into the person's working copy with merge --ff-only. It never discards or overwrites the person's work:
// on divergence or a local change to a touched file it refuses with the reason and git status stays as it was.
export type ApplyResult =
  | { ok: true; ref: string; head: string; files: string[] }
  | { ok: false; reason: "no_branch" | "not_a_repo" | "diverged" | "local_changes" | "merge_refused"; detail?: string };

export async function applyLocal(o: { mirror: string; repo: string; taskId: string }): Promise<ApplyResult> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(o.taskId)) return { ok: false, reason: "no_branch" };
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-apply-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    const refs = (await git.run(["for-each-ref", "--format=%(refname:short)", `refs/heads/mandat/${o.taskId}-a*`], { cwd: o.mirror })).stdout.toString("utf8").split("\n").filter((r) => new RegExp(`^mandat/${o.taskId}-a\\d+$`).test(r));
    const ref = refs.sort((a, b) => Number(a.split("-a").pop()) - Number(b.split("-a").pop())).pop();
    if (!ref) return { ok: false, reason: "no_branch" };
    if ((await git.run(["rev-parse", "--is-inside-work-tree"], { cwd: o.repo })).code !== 0) return { ok: false, reason: "not_a_repo" };
    if ((await git.run(["fetch", "-q", "--no-tags", "--end-of-options", path.resolve(o.mirror), `refs/heads/${ref}`], { cwd: o.repo })).code !== 0) return { ok: false, reason: "no_branch" };
    const sha = (await git.run(["rev-parse", "FETCH_HEAD"], { cwd: o.repo })).stdout.toString("utf8").trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, reason: "no_branch" };
    if ((await git.run(["merge-base", "--is-ancestor", "HEAD", sha], { cwd: o.repo })).code !== 0) return { ok: false, reason: "diverged", detail: "your branch has commits the task's branch does not; rebase or merge by hand" };
    const touched = (await git.run(["diff", "--name-only", "HEAD", sha], { cwd: o.repo })).stdout.toString("utf8").split("\n").filter(Boolean);
    const mine = new Set((await git.run(["diff", "--name-only", "HEAD"], { cwd: o.repo })).stdout.toString("utf8").split("\n").filter(Boolean));
    const both = touched.filter((f) => mine.has(f));
    if (both.length > 0) return { ok: false, reason: "local_changes", detail: both.slice(0, 20).join(", ") };
    const m = await git.run(["merge", "--ff-only", "-q", sha], { cwd: o.repo }); // T3-7: sha
    if (m.code !== 0) return { ok: false, reason: "merge_refused", detail: m.stderr.slice(0, 300) };
    return { ok: true, ref, head: sha, files: touched };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
