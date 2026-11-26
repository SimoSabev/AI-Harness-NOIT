import { writeFileSync } from "node:fs";
import path from "node:path";
import type { CleanGit } from "@mandat/export";

// D-635, D-636: a folder without git history, as one commit — made in a git dir of Mandat's own under `tmp`, with the
// folder only as the work tree that is read (nothing is ever written into it). The same rules every time, so the same
// files give the same tree: what "Add project" stores and what "Bring into my folder" compares against.

/** never in a snapshot (dependencies and Finder files); the folder's own .gitignore applies as well */
export const SNAPSHOT_EXCLUDE = ["node_modules", ".DS_Store", "Thumbs.db"];
export const SNAPSHOT_ID = ["-c", "user.name=Harnova", "-c", "user.email=harnova@localhost", "-c", "commit.gpgsign=false"];

/** one commit of the folder's files; `from` is the repo to clone or fetch it from, `gitDir` its .git */
export async function snapshotFolder(git: CleanGit, folder: string, tmp: string): Promise<{ from: string; gitDir: string; sha: string }> {
  const snap = path.join(tmp, "snapshot");
  if ((await git.run(["init", "-q", "-b", "main", snap], { cwd: tmp })).code !== 0) throw new Error("git init failed");
  const gitDir = path.join(snap, ".git");
  writeFileSync(path.join(gitDir, "info", "exclude"), `${SNAPSHOT_EXCLUDE.join("\n")}\n`);
  const at = ["--git-dir", gitDir, "--work-tree", folder];
  if ((await git.run([...at, "add", "-A"], { cwd: tmp })).code !== 0) throw new Error("git add failed");
  if ((await git.run([...SNAPSHOT_ID, ...at, "commit", "-q", "--allow-empty", "--no-verify", "-m", "Harnova: the folder as it was when it was added"], { cwd: tmp })).code !== 0) throw new Error("git commit failed");
  const head = await git.run(["--git-dir", gitDir, "rev-parse", "HEAD"], { cwd: tmp });
  if (head.code !== 0) throw new Error("no snapshot commit");
  return { from: snap, gitDir, sha: head.stdout.toString("utf8").trim() };
}
