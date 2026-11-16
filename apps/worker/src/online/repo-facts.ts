import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";
import type { RepoFacts } from "@mandat/memory";

// Round 2: what a project's main has — its files and its package scripts — read from Mandat's mirror on this computer
// (file://), so project memories can be checked against it. Any other remote, or a mirror that cannot be read: null.
const MAX_FILES = 50_000;

export async function repoFacts(remoteUrl: string): Promise<RepoFacts | null> {
  if (!remoteUrl.startsWith("file://")) return null;
  const mirror = remoteUrl.slice("file://".length);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-facts-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    const ls = await git.run(["ls-tree", "-r", "-z", "--name-only", "refs/heads/main"], { cwd: mirror }).catch(() => null);
    if (!ls || ls.code !== 0) return null;
    const files = new Set(ls.stdout.toString("utf8").split("\0").filter(Boolean).slice(0, MAX_FILES));
    let scripts: Record<string, string> | null = null;
    if (files.has("package.json")) {
      const pj = await git.run(["show", "refs/heads/main:package.json"], { cwd: mirror }).catch(() => null);
      try {
        const s: unknown = pj && pj.code === 0 ? (JSON.parse(pj.stdout.toString("utf8")) as { scripts?: unknown }).scripts : undefined;
        scripts = s !== null && typeof s === "object" ? Object.fromEntries(Object.entries(s).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
      } catch {
        scripts = null; // an unreadable package.json: scripts are not checked
      }
    }
    return { files, scripts };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
