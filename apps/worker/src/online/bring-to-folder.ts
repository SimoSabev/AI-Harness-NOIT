import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";
import type { BringReply } from "@mandat/contract";

// D-540 (live test 18.11): after a job is merged, the change is only in Mandat's mirror. "Bring into my folder" — a
// person's click, never the worker by itself — fast-forwards the project's own folder (the mirror's `mandat.source`,
// D-388) to the delivered commit. Only when it is safe: the folder is a git repo on the delivered branch, clean (nothing
// staged, changed, or untracked and not ignored), and its HEAD is an ancestor of the mirror's main. Everything is checked
// in the mirror before the folder is touched; then one `fetch` and one `merge --ff-only`. Never force, stash or reset.
const SHA = /^[0-9a-f]{40}$/;
const q = (p: string) => `"${p}"`;

const real = (p: string): string | null => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};
const no = (reason: Extract<BringReply, { ok: false }>["reason"], folder: string | null, detail: string | null = null, command: string | null = null): BringReply => ({ ok: false, reason, folder, detail, command });

export async function bringToFolder(o: { home: string; mirror: string; sha: string; branch?: string; tmpRoot?: string }): Promise<BringReply> {
  if (!SHA.test(o.sha)) return no("not_delivered", null);
  const projects = real(path.join(o.home, "projects"));
  const mirror = real(o.mirror);
  // only a mirror Mandat made for a local project (D-388): MANDAT_HOME/projects/<name>.git
  if (!projects || !mirror || path.dirname(mirror) !== projects || !mirror.endsWith(".git")) return no("no_source", null);
  const tmp = mkdtempSync(path.join(o.tmpRoot ?? os.tmpdir(), "mandat-bring-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    const text = async (args: string[], cwd: string) => {
      const r = await git.run(args, { cwd });
      return { code: r.code, out: r.stdout.toString("utf8").trim() };
    };
    const src = await text(["config", "--get", "mandat.source"], mirror);
    const folder = src.code === 0 && src.out !== "" ? real(src.out) : null;
    if (!folder) return no("no_source", null);
    const branch = o.branch ?? "main";
    const pull = `git -C ${q(folder)} pull --ff-only ${q(mirror)} main`;
    // the delivered commit is on the mirror's main
    const main = await text(["rev-parse", "--verify", "--quiet", "refs/heads/main^{commit}"], mirror);
    if (main.code !== 0 || !SHA.test(main.out) || (await text(["merge-base", "--is-ancestor", o.sha, main.out], mirror)).code !== 0) return no("not_delivered", folder);
    // the folder is the top of a git repo
    const top = await text(["rev-parse", "--show-toplevel"], folder);
    if (top.code !== 0 || real(top.out) !== folder) return no("not_a_repo", folder);
    // on the delivered branch (a detached HEAD is no branch)
    const current = await text(["symbolic-ref", "--quiet", "--short", "HEAD"], folder);
    if (current.code !== 0 || current.out !== branch) return no("other_branch", folder, current.code === 0 ? current.out.slice(0, 200) : "HEAD", `git -C ${q(folder)} switch ${branch}`);
    // clean: nothing staged, changed or untracked-but-not-ignored
    const st = await git.run(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], { cwd: folder });
    if (st.code !== 0) return no("not_a_repo", folder);
    const dirty = st.stdout.toString("utf8").split("\0").filter((x) => x !== "").length;
    if (dirty > 0) return no("dirty", folder, `${dirty}`, pull);
    const head = await text(["rev-parse", "--verify", "HEAD^{commit}"], folder);
    if (head.code !== 0 || !SHA.test(head.out)) return no("not_a_repo", folder);
    if (head.out === main.out) return { ok: true, folder, from: head.out, to: main.out, files: 0 };
    // a fast-forward only when the folder's HEAD is in the mirror's main (an unknown commit is the person's own work)
    if ((await text(["merge-base", "--is-ancestor", head.out, main.out], mirror)).code !== 0) return no("diverged", folder, null, `git -C ${q(folder)} pull --no-rebase ${q(mirror)} main`); // T3-7: sha (both checked by SHA above; the string is only shown to the person)
    const files = (await text(["diff", "--name-only", head.out, main.out], mirror)).out.split("\n").filter(Boolean).length;
    if ((await git.run(["fetch", "-q", "--no-tags", "--end-of-options", mirror, "refs/heads/main"], { cwd: folder })).code !== 0) return no("refused", folder, "fetch", pull);
    if ((await text(["rev-parse", "FETCH_HEAD"], folder)).out !== main.out) return no("refused", folder, "the mirror moved", pull);
    const m = await git.run(["merge", "--ff-only", "-q", main.out], { cwd: folder }); // T3-7: sha
    if (m.code !== 0) return no("refused", folder, m.stderr.replace(/\s+/g, " ").trim().slice(0, 300), pull);
    return { ok: true, folder, from: head.out, to: main.out, files };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
