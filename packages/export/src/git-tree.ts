import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import type { ChangedFile } from "@mandat/contract";
import { cleanGit } from "./clean-git.js";
import type { CleanGit } from "./clean-git.js";

export async function must(git: CleanGit, args: string[], cwd: string, input?: Buffer): Promise<Buffer> {
  const r = await git.run(args, input ? { cwd, input } : { cwd });
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.slice(0, 300)}`);
  return r.stdout;
}

/** 7.4(1): clean clone of the mirror at base (no worktree, no hooks, no attributes from the tree). */
export async function cleanClone(o: { mirrorPath: string; baseSha: string; tmpRoot: string; name: string }): Promise<{ dir: string; git: CleanGit }> {
  const home = mkdtempSync(path.join(o.tmpRoot, "home-"));
  const git = cleanGit({ tmpHome: home });
  const dir = path.join(o.tmpRoot, `${o.name}-${path.basename(home)}`);
  mkdirSync(o.tmpRoot, { recursive: true });
  await must(git, ["clone", "-q", "--no-local", "--no-checkout", o.mirrorPath, dir], o.tmpRoot);
  await must(git, ["checkout", "-q", "--detach", o.baseSha], dir);
  return { dir, git };
}

export function removeTree(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** D-093: `--name-status -M -z` parsed by NUL; paths are the raw UTF-8 strings. */
export function parseNameStatus(z: Buffer): { status: ChangedFile["status"]; path: string; old_path?: string }[] {
  const t = z.toString("utf8").split("\0");
  const out: { status: ChangedFile["status"]; path: string; old_path?: string }[] = [];
  for (let i = 0; i < t.length; ) {
    const s = t[i];
    if (s === undefined || s === "") {
      i++;
      continue;
    }
    const letter = s.charAt(0);
    if (letter === "R" || letter === "C") {
      const old = t[i + 1] ?? "";
      const nw = t[i + 2] ?? "";
      out.push(letter === "R" ? { status: "R", path: nw, old_path: old } : { status: "A", path: nw });
      i += 3;
    } else {
      out.push({ status: letter === "A" ? "A" : letter === "D" ? "D" : "M", path: t[i + 1] ?? "" });
      i += 2;
    }
  }
  return out;
}
