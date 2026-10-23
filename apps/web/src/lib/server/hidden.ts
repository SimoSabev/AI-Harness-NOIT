import { z } from "zod";
import { jcs, sha256Tag } from "@mandat/contract";
import type { Result, SecondFactor } from "./actions";
import { hasCap } from "./roles";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";

// v5 E9b (5.2, D-362): D5 hidden tests. A person uploads them (approve.rules + a fresh TOTP); they go to a private table
// the worker reads and copy into tree B only. The browser gets back the metadata (version, count, hash), never the files.
const PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
export const HiddenUploadBody = z
  .object({
    files: z.array(z.object({ path: z.string().max(300).regex(PATH).refine((p) => !p.split("/").includes(".."), { message: "outside" }), content: z.string().max(1024 * 1024) }).strict()).min(1).max(200),
    code: z.string().regex(/^\d{6}$/).optional(),
    factor_id: z.string().max(100).optional(),
  })
  .strict()
  .refine((b) => b.files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0) <= 5 * 1024 * 1024, { message: "too large" });
const err = (status: number, error: string): Result => ({ status, body: { error } });
const pgCode = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined);

export async function uploadHidden(db: Db, o: { uid: string; repoId: string; body: unknown; secondFactor: SecondFactor }): Promise<Result> {
  const org = (await asService(db, (sql) => sql.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1::uuid", [o.repoId]))).rows[0]?.org_id;
  if (!org) return err(404, "unknown_repo");
  if (!(await hasCap(db, o.uid, org, "approve.rules", { repo: o.repoId }))) return err(403, "not_allowed");
  const b = HiddenUploadBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_hidden_tests");
  if (!b.data.code) return err(403, "second_factor_required");
  const mfaAt = await o.secondFactor({ uid: o.uid, code: b.data.code, factorId: b.data.factor_id });
  if (!mfaAt) return err(403, "second_factor_invalid");
  const files = [...b.data.files].sort((x, y) => (x.path < y.path ? -1 : 1)).map((f) => ({ path: f.path, data: Buffer.from(f.content, "utf8").toString("base64") }));
  const hash = sha256Tag(jcs(files));
  try {
    const v = await asService(db, async (sql) => (await sql.query<{ v: number }>("select private.add_hidden_tests($1::uuid, $2::jsonb, $3, $4::uuid, $5::timestamptz) as v", [o.repoId, JSON.stringify(files), hash, o.uid, mfaAt.toISOString()])).rows[0]?.v);
    return { status: 201, body: { version: v, files: files.length, hash } };
  } catch (e) {
    const c = pgCode(e);
    if (c === "42501") return err(403, "second_factor_rejected");
    if (c === "22023") return err(400, "bad_hidden_tests");
    throw e;
  }
}

export interface HiddenSet { version: number; files: number; hash: string; created_at: string }
export async function hiddenSets(db: Db, uid: string, repoId: string): Promise<HiddenSet[]> {
  return asUser(db, uid, async (sql) => (await sql.query<HiddenSet>("select version, files, hash, to_char(created_at at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at from public.hidden_test_sets where repo_id = $1::uuid order by version desc limit 20", [repoId])).rows);
}
