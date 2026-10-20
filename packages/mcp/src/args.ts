import { realpathSync, statSync } from "node:fs";
import path from "node:path";

// Демо промпт т. 7.3 (D-214, F16, S35): who may be verified and with which trusted remote.

export interface Allowed {
  dir: string; // realpath
  remote: string;
}
export interface McpArgs {
  allowed: Allowed[];
  sameUid: boolean;
  socket: string;
  home: string | null;
}

/** Env names that must never reach an MCP server (S35). */
export function secretsInEnv(env: Record<string, string | undefined>): string[] {
  return Object.keys(env).filter((k) => env[k] !== undefined && (k === "SUPABASE_SERVICE_ROLE_KEY" || /^SUPABASE_.*KEY.*$/.test(k) || /^GITHUB_.*PRIVATE_KEY$/.test(k) || k === "ANTHROPIC_API_KEY" || k === "OPENAI_API_KEY")).sort();
}

export type ParsedArgs = { ok: true; args: McpArgs } | { ok: false; error: string };

export function parseMcpArgs(argv: string[], env: Record<string, string | undefined>): ParsedArgs {
  const secrets = secretsInEnv(env);
  if (secrets.length > 0) return { ok: false, error: "secrets not allowed in MCP env" };
  const dirs: string[] = [];
  const remotes: string[] = [];
  let sameUid = false;
  let socket = env.MANDAT_VERIFYD_SOCKET ?? "/run/mandat/verifyd.sock";
  let home: string | null = null;
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    const val = (): string | null => {
      const v = argv[++k];
      return v === undefined || v.startsWith("--") ? null : v;
    };
    if (a === "--allow") {
      const v = val();
      if (v === null) return { ok: false, error: "--allow needs a directory" };
      dirs.push(v);
    } else if (a === "--allow-project-dir") {
      const v = env.CLAUDE_PROJECT_DIR;
      if (!v) return { ok: false, error: "--allow-project-dir: CLAUDE_PROJECT_DIR is not set" };
      dirs.push(v);
    } else if (a === "--remote") {
      const v = val();
      if (v === null || v.startsWith("-")) return { ok: false, error: "--remote needs a URL" };
      remotes.push(v);
    } else if (a === "--same-uid") sameUid = true;
    else if (a === "--socket") {
      const v = val();
      if (v === null || !path.isAbsolute(v)) return { ok: false, error: "--socket needs an absolute path" };
      socket = v;
    } else if (a === "--home") {
      const v = val();
      if (v === null || !path.isAbsolute(v)) return { ok: false, error: "--home needs an absolute path" };
      home = v;
    } else return { ok: false, error: `unknown argument ${a ?? ""}` };
  }
  if (dirs.length === 0) return { ok: false, error: "empty allowlist (--allow <abs dir> or --allow-project-dir)" };
  if (remotes.length !== dirs.length) return { ok: false, error: "one --remote per allowed directory, in the same order" };
  const allowed: Allowed[] = [];
  for (const [i, d] of dirs.entries()) {
    if (!path.isAbsolute(d)) return { ok: false, error: `--allow must be absolute: ${d}` };
    let real: string;
    try {
      real = realpathSync(d);
      if (!statSync(real).isDirectory()) return { ok: false, error: `not a directory: ${d}` };
    } catch {
      return { ok: false, error: `no such directory: ${d}` };
    }
    allowed.push({ dir: real, remote: remotes[i] as string });
  }
  return { ok: true, args: { allowed, sameUid, socket, home } };
}

/** repo_path must be (after realpath) equal to or under an allowed dir; no symlink escape. */
export function resolveRepo(allowed: Allowed[], repoPath: string | undefined): { ok: true; repo: string; remote: string } | { ok: false; error: "repo not allowed" } {
  const first = allowed[0];
  if (!first) return { ok: false, error: "repo not allowed" };
  if (repoPath === undefined) return { ok: true, repo: first.dir, remote: first.remote };
  if (!path.isAbsolute(repoPath)) return { ok: false, error: "repo not allowed" };
  let real: string;
  try {
    real = realpathSync(repoPath);
  } catch {
    return { ok: false, error: "repo not allowed" };
  }
  for (const a of allowed) {
    if (real === a.dir || real.startsWith(a.dir + path.sep)) return { ok: true, repo: real, remote: a.remote };
  }
  return { ok: false, error: "repo not allowed" };
}
