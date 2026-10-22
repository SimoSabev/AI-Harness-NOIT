import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";

// E8f (v5 p. 4.6 (3), AC-4.5, D-355): the base moved while the task ran. The change is applied 3-way onto the new main in a
// temporary clone (hooks off, clean git): clean → the rebased patch, which a new attempt verifies in the sandbox (a new
// verdict; the old one stays); conflict → the conflicting files and the conflict itself as an artifact. Never a force push.
/** contents: the new bytes of each changed file (null = deleted), written into the attempt's work tree instead of an agent */
export type Rebase = { kind: "clean"; patch: Buffer; files: string[]; contents: { path: string; data: Buffer | null }[] } | { kind: "conflict"; diff: string; files: string[] };

export async function mainHead(mirror: string): Promise<string> {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-head-"));
  try {
    const r = await cleanGit({ tmpHome: tmp }).run(["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], { cwd: mirror });
    return r.stdout.toString("utf8").trim();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function rebaseOnto(o: { mirror: string; base: string; patch: Buffer; tmpRoot?: string }): Promise<Rebase> {
  if (!/^[0-9a-f]{40}$/.test(o.base)) throw new Error("rebase: bad base");
  const tmp = mkdtempSync(path.join(o.tmpRoot ?? os.tmpdir(), "mandat-rebase-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    const w = path.join(tmp, "w");
    const c = await git.run(["clone", "-q", "--no-checkout", "--end-of-options", o.mirror, w], { cwd: tmp });
    if (c.code !== 0) throw new Error(`rebase: clone failed: ${c.stderr.slice(0, 200)}`);
    if ((await git.run(["checkout", "-q", "--detach", o.base], { cwd: w })).code !== 0) throw new Error("rebase: no such base");
    const p = path.join(tmp, "change.patch");
    writeFileSync(p, o.patch);
    const a = await git.run(["apply", "--3way", "--index", "--whitespace=nowarn", p], { cwd: w });
    if (a.code === 0) {
      const patch = (await git.run(["diff", "--cached", "--binary", o.base], { cwd: w })).stdout;
      const files = (await git.run(["diff", "--cached", "--name-only", o.base], { cwd: w })).stdout.toString("utf8").split("\n").filter(Boolean);
      const contents: { path: string; data: Buffer | null }[] = [];
      for (const f of files) {
        const show = await git.run(["show", `:${f}`], { cwd: w });
        contents.push({ path: f, data: show.code === 0 ? show.stdout : null });
      }
      return { kind: "clean", patch, files, contents };
    }
    const files = (await git.run(["diff", "--name-only", "--diff-filter=U"], { cwd: w })).stdout.toString("utf8").split("\n").filter(Boolean);
    const diff = (await git.run(["diff"], { cwd: w })).stdout.toString("utf8");
    return { kind: "conflict", files: files.length > 0 ? files : ["(the change does not apply)"], diff: (diff || a.stderr).slice(0, 1_048_576) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
