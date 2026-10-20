import { lstatSync } from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { create } from "tar";
import { cleanGit } from "@mandat/export";

// Демо промпт т. 5.7 (3) / F12: the agent's tree = tracked + untracked (not ignored) − deleted from the work tree.
// Read-only: `ls-files` with hooks/fsmonitor off (ls-files never refreshes the index).

export async function workingTreeFiles(o: { repo: string; tmpHome: string }): Promise<string[]> {
  const git = cleanGit({ tmpHome: o.tmpHome });
  const run = async (args: string[]) => {
    const r = await git.run(["-c", "core.quotePath=false", ...args], { cwd: o.repo });
    if (r.code !== 0) throw new Error(`git ls-files failed: ${r.stderr.slice(0, 200)}`);
    return r.stdout.toString("utf8").split("\0").filter(Boolean);
  };
  const all = await run(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const deleted = new Set(await run(["ls-files", "-z", "--deleted"]));
  const out: string[] = [];
  for (const f of new Set(all)) {
    if (deleted.has(f)) continue;
    try {
      lstatSync(path.join(o.repo, f));
      out.push(f);
    } catch {
      // gone between ls-files and lstat
    }
  }
  return out.sort();
}

/** A tar stream of exactly these files (symlinks stay symlinks; scanTar rejects them). */
export function tarOf(repo: string, files: string[]): { stream: NodeJS.ReadableStream; exit: Promise<{ code: number; stderr: string }> } {
  const pass = new PassThrough();
  const exit = new Promise<{ code: number; stderr: string }>((resolve) => {
    if (files.length === 0) {
      pass.end(Buffer.alloc(1024)); // a valid empty tar (two zero blocks)
      resolve({ code: 0, stderr: "" });
      return;
    }
    const t = create({ cwd: repo, portable: true, follow: false, noDirRecurse: true }, files);
    t.on("error", (e: unknown) => {
      pass.end();
      resolve({ code: 1, stderr: `tar: ${e instanceof Error ? e.message : String(e)}` });
    });
    t.on("end", () => resolve({ code: 0, stderr: "" }));
    t.pipe(pass);
  });
  return { stream: pass, exit };
}
