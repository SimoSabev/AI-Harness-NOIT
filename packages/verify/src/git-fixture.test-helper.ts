import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: os.tmpdir(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t.invalid" };
export const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "init.defaultBranch=main", ...args], { cwd, env: ENV, encoding: "utf8" }).trim();

/** A bare "remote" with main (files) and a clone on a feature branch. */
export function remoteAndClone(files: Record<string, string>): { root: string; remote: string; repo: string; base: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-verify-"));
  const seed = path.join(root, "seed");
  mkdirSync(seed);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(seed, f)), { recursive: true });
    writeFileSync(path.join(seed, f), c);
  }
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const base = sh(seed, "rev-parse", "HEAD");
  const remote = path.join(root, "remote.git");
  sh(root, "clone", "-q", "--bare", seed, remote);
  const repo = path.join(root, "repo");
  sh(root, "clone", "-q", remote, repo);
  sh(repo, "checkout", "-q", "-b", "fix/x");
  return { root, remote, repo, base };
}
