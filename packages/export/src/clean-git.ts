import { spawn } from "node:child_process";

/** The empty tree; `attr.tree` pointing at it makes git ignore .gitattributes from the work tree (git ≥ 2.43.0). */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** `-c` flags for every git call outside the sandbox (4.1, 7.4(1)). Never `attr.tree=` (empty) — that is [НП]. */
export const CLEAN_GIT_CONFIG: readonly string[] = [
  "core.hooksPath=/dev/null",
  "core.fsmonitor=false",
  `attr.tree=${EMPTY_TREE}`,
  "core.autocrlf=false",
  "protocol.file.allow=always",
];

/** Minimal environment: no system/global config, no attributes from the system, no prompts, a throwaway HOME. */
export function cleanGitEnv(tmpHome: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: tmpHome,
    LANG: "C.UTF-8",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

export interface CleanGit {
  run(args: string[], o: { cwd: string; input?: Buffer }): Promise<{ stdout: Buffer; stderr: string; code: number }>;
}

export function cleanGit(o: { tmpHome: string }): CleanGit {
  const env = cleanGitEnv(o.tmpHome);
  const prefix = CLEAN_GIT_CONFIG.flatMap((f) => ["-c", f]);
  return {
    run(args, ro) {
      return new Promise((resolve, reject) => {
        const child = spawn("git", [...prefix, ...args], { cwd: ro.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on("data", (c: Buffer) => out.push(c));
        child.stderr.on("data", (c: Buffer) => err.push(c));
        child.on("error", reject);
        child.on("close", (code) => {
          // A process killed by a signal has no exit code; report it as a failure.
          /* v8 ignore next */
          const exit = code ?? 1;
          resolve({ stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8"), code: exit });
        });
        child.stdin.end(ro.input ?? undefined);
      });
    },
  };
}
