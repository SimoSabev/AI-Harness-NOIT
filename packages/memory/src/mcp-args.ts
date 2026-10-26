import type { MemorySql } from "./store.js";

// D-402: `mandat-memory-mcp [--repo <name|id>] [--user <uuid>]`. The database is `pnpm local`'s (MANDAT_DB_URL overrides);
// the person is --user or the only owner (the local one); the project is optional (without it: only the person's memory).

export const LOCAL_MEMORY_DB = "postgresql://postgres:postgres@127.0.0.1:54329/postgres";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface MemoryArgs { dbUrl: string; user: string | null; repo: string | null }

/** Same rule as the `mandat` MCP server (S35): no provider or service keys in an MCP server's env. */
function secretsInEnv(env: Record<string, string | undefined>): boolean {
  return Object.keys(env).some((k) => env[k] !== undefined && (k === "ANTHROPIC_API_KEY" || k === "OPENAI_API_KEY" || /^SUPABASE_.*KEY/.test(k) || /^GITHUB_.*PRIVATE_KEY$/.test(k)));
}

export function parseMemoryArgs(argv: readonly string[], env: Record<string, string | undefined>): { ok: true; args: MemoryArgs } | { ok: false; error: string } {
  if (secretsInEnv(env)) return { ok: false, error: "secrets not allowed in MCP env" };
  const args: MemoryArgs = { dbUrl: env.MANDAT_DB_URL ?? LOCAL_MEMORY_DB, user: null, repo: null };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k] ?? "";
    if (a !== "--repo" && a !== "--user") return { ok: false, error: `unknown argument ${a}` };
    const v = argv[++k];
    if (v === undefined || v.startsWith("--")) return { ok: false, error: `${a} needs a value` };
    if (a === "--user") {
      if (!UUID.test(v)) return { ok: false, error: "--user must be a uuid" };
      args.user = v;
    } else args.repo = v;
  }
  return { ok: true, args };
}

export async function resolveMemoryScope(sql: MemorySql, a: MemoryArgs): Promise<{ ok: true; org: string; user: string; repo: string | null } | { ok: false; error: string }> {
  const m = a.user
    ? (await sql.query<{ org_id: string; user_id: string }>("select org_id::text as org_id, user_id::text as user_id from public.members where user_id = $1::uuid order by created_at limit 1", [a.user])).rows
    : (await sql.query<{ org_id: string; user_id: string }>("select org_id::text as org_id, user_id::text as user_id from public.members where role = 'owner' order by created_at limit 2")).rows;
  if (m.length === 0) return { ok: false, error: a.user ? "the user is not a member of any org" : "no owner yet: start `pnpm local` once" };
  if (m.length > 1) return { ok: false, error: "more than one owner: pass --user <uuid>" };
  const { org_id: org, user_id: user } = m[0] as { org_id: string; user_id: string };
  if (a.repo === null) return { ok: true, org, user, repo: null };
  const r = (await sql.query<{ id: string }>(`select id::text as id from public.repos where org_id = $1::uuid and (full_name = $2 ${UUID.test(a.repo) ? "or id = $2::uuid" : ""}) limit 1`, [org, a.repo])).rows[0];
  return r ? { ok: true, org, user, repo: r.id } : { ok: false, error: `no such project: ${a.repo}` };
}
