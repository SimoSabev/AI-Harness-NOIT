import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A local bare repo that plays the base repo on GitHub: main = fixtures/demo-shop, refs/pull/<n>/head = the PR head
// (tests and `mandat demo external-pr --fake`).
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ENV = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: os.tmpdir(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t.invalid" };
export const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "init.defaultBranch=main", ...args], { cwd, env: ENV, encoding: "utf8" }).trim();
export const M = "tests/cart.spec.ts > cart > applies 10% over 50";
export const deleteM = (s: string) => s.replace(/ {2}it\("applies 10% over 50"[\s\S]*?\n {2}\}\);\n/, "");

export function demoRepoWithPull(edit: (work: string) => void, n = 1): { bare: string; base: string; head: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-gh-"));
  const work = path.join(root, "work");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), work, { recursive: true, filter: (s) => !s.includes("node_modules") });
  sh(work, "init", "-q");
  sh(work, "add", "-A");
  sh(work, "commit", "-qm", "base");
  const base = sh(work, "rev-parse", "HEAD");
  sh(work, "checkout", "-q", "-b", "octo/fix");
  edit(work);
  sh(work, "add", "-A");
  sh(work, "commit", "-qm", "agent change");
  const head = sh(work, "rev-parse", "HEAD");
  const bare = path.join(root, "shop.git");
  sh(root, "init", "-q", "--bare", bare);
  sh(work, "push", "-q", bare, "main:refs/heads/main", `octo/fix:refs/pull/${n}/head`);
  sh(bare, "symbolic-ref", "HEAD", "refs/heads/main");
  return { bare, base, head };
}
export const editFile = (dir: string, f: string, fn: (s: string) => string) => writeFileSync(path.join(dir, f), fn(readFileSync(path.join(dir, f), "utf8")));
