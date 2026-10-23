import { z } from "zod";
import { HarnessProfile } from "@mandat/contract";
import { compileProfile } from "@mandat/profile";
import { factorAt } from "./actions";
import type { Result, SecondFactor } from "./actions";
import { hasCap } from "./roles";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";

// E8b (v5 p. 4.2, D-351): the harness profile of a repo — versions, the layers with their sources, the compiled preview
// (what Claude Code and Codex would get), approval with a fresh TOTP and rollback (a new version).
export const ProfileApproveBody = z.object({ profile_id: z.string().uuid(), factor_id: z.string().max(100).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict();
export const ProfileRollbackBody = z.object({ version: z.number().int().min(1), factor_id: z.string().max(100).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict();

export interface ProfileVersion { id: string; version: number; status: "proposed" | "approved" | "superseded"; layers: Record<string, unknown>; sources: Record<string, string>; profile_hash: string; approved_at: string | null }
export interface ProfileView { versions: ProfileVersion[]; preview: { claude: { path: string; bytes: string }[]; codex: { path: string; bytes: string }[]; enforced: { rule: string; why: string }[]; unsupported: { rule: string; why: string }[] } }

const err = (status: number, error: string): Result => ({ status, body: { error } });
const pgCode = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined);

export async function profileView(db: Db, uid: string, org: string, repoId: string): Promise<ProfileView> {
  const versions = await asUser(db, uid, async (sql) =>
    (await sql.query<ProfileVersion>(
      `select id::text as id, version, status, layers, sources, profile_hash, to_char(approved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as approved_at
         from public.harness_profiles where org_id = $1::uuid and repo_id = $2::uuid order by version desc limit 20`,
      [org, repoId],
    )).rows,
  );
  const empty = { claude: [], codex: [], enforced: [], unsupported: [] };
  const top = versions[0];
  if (!top) return { versions, preview: empty };
  const p = HarnessProfile.safeParse({ version: top.version, repo_id: repoId, layers: top.layers, sources: top.sources, profile_hash: top.profile_hash, approved_by: null, approved_at: null });
  if (!p.success) return { versions, preview: empty };
  const ctx = { runId: "r_preview", subjects: ["agent:claude", "any"] };
  const c = compileProfile(p.data, "claude", ctx);
  const x = compileProfile(p.data, "codex", { ...ctx, subjects: ["agent:codex", "any"] });
  return { versions, preview: { claude: c.files.map(({ path, bytes }) => ({ path, bytes })), codex: x.files.map(({ path, bytes }) => ({ path, bytes })), enforced: c.enforced_by_harness, unsupported: c.unsupported } };
}

async function orgOf(db: Db, repoId: string): Promise<string | null> {
  return (await asService(db, (sql) => sql.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1::uuid", [repoId]))).rows[0]?.org_id ?? null;
}

export async function approveProfile(db: Db, o: { uid: string; repoId: string; body: z.infer<typeof ProfileApproveBody>; secondFactor: SecondFactor }): Promise<Result> {
  const org = await orgOf(db, o.repoId);
  if (!org) return err(404, "unknown_repo");
  if (!(await hasCap(db, o.uid, org, "approve.rules", { repo: o.repoId }))) return err(403, "not_an_owner");
  const row = (await asService(db, (sql) => sql.query<{ repo_id: string; status: string }>("select repo_id::text as repo_id, status from public.harness_profiles where id = $1::uuid", [o.body.profile_id]))).rows[0];
  if (!row || row.repo_id !== o.repoId) return err(404, "unknown_profile");
  if (row.status !== "proposed") return err(409, "not_proposed");
  const f = await factorAt(o.secondFactor, { uid: o.uid, code: o.body.code, factorId: o.body.factor_id });
  if (!("at" in f)) return f;
  const mfaAt = f.at;
  try {
    const v = await asService(db, async (sql) => (await sql.query<{ v: number }>("select private.approve_profile($1::uuid, $2::uuid, $3::timestamptz) as v", [o.body.profile_id, o.uid, mfaAt.toISOString()])).rows[0]?.v);
    return { status: 200, body: { version: v } };
  } catch (e) {
    const c = pgCode(e);
    if (c === "42501") return err(403, "second_factor_rejected");
    if (c === "55000") return err(409, "blocked_invisible_characters");
    throw e;
  }
}

export async function rollbackProfile(db: Db, o: { uid: string; repoId: string; body: z.infer<typeof ProfileRollbackBody>; secondFactor: SecondFactor }): Promise<Result> {
  const org = await orgOf(db, o.repoId);
  if (!org) return err(404, "unknown_repo");
  if (!(await hasCap(db, o.uid, org, "approve.rules", { repo: o.repoId }))) return err(403, "not_an_owner");
  const f = await factorAt(o.secondFactor, { uid: o.uid, code: o.body.code, factorId: o.body.factor_id });
  if (!("at" in f)) return f;
  const mfaAt = f.at;
  try {
    const v = await asService(db, async (sql) => (await sql.query<{ v: number }>("select private.rollback_profile($1::uuid, $2, $3::uuid, $4::timestamptz) as v", [o.repoId, o.body.version, o.uid, mfaAt.toISOString()])).rows[0]?.v);
    return { status: 200, body: { version: v } };
  } catch (e) {
    const c = pgCode(e);
    if (c === "P0002") return err(404, "unknown_version");
    if (c === "42501") return err(403, "second_factor_rejected");
    throw e;
  }
}
