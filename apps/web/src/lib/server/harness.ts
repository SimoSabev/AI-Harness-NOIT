import { z } from "zod";
import { parseMandatYml, sha256Tag } from "@mandat/contract";
import { classifyCommand, findInvisible, generateHarnessFiles } from "@mandat/onboard";
import type { Result, SecondFactor } from "./actions";
import { asService, asUser } from "./sql";
import type { Db } from "./sql";

// Демо промпт т. 8.2 (7)–(8): POST /api/repos/:id/harness/approve {proposal_id, edited_yaml?, generate, factor_id, code}
// → owner + a NEW TOTP code → files by template → private.approve_harness (one transaction). Never auto-approved.
export const HarnessApproveBody = z.object({
  proposal_id: z.string().uuid(),
  edited_yaml: z.string().max(64 * 1024).optional(),
  generate: z.boolean(),
  factor_id: z.string().max(100).optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
}).strict();

type Existing = { ".mandat.yml": string | null; "AGENTS.md": string | null; "CLAUDE.md": string | null };
interface Row { org_id: string; repo_id: string; status: string; policy_yaml: string; blocked: string[]; scan: { existing?: Existing; scripts?: Record<string, string>; package_manager?: string | null; links?: string[] }; config_version: number }

const err = (status: number, error: string): Result => ({ status, body: { error } });
const isOwner = (db: Db, uid: string, org: string) => asUser(db, uid, async (sql) => (await sql.query<{ ok: boolean }>("select private.authorize('owner', $1::uuid) as ok", [org])).rows[0]?.ok === true);
const pgCode = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined);

export async function connectRepo(db: Db, o: { uid: string; repoId: string }): Promise<Result> {
  const r = (await asService(db, (sql) => sql.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1::uuid", [o.repoId]))).rows[0];
  if (!r) return err(404, "unknown_repo");
  if (!(await isOwner(db, o.uid, r.org_id))) return err(403, "not_an_owner");
  const key = `scan:${o.repoId}:${Math.floor(Date.now() / 60_000)}`;
  await asService(db, (sql) => sql.query("insert into public.outbox (org_id, kind, idempotency_key, payload) values ($1::uuid, 'harness_scan', $2, $3::jsonb) on conflict (idempotency_key) do nothing", [r.org_id, key, JSON.stringify({ repo_id: o.repoId })]));
  return { status: 202, body: { queued: true } };
}

export async function approveHarness(db: Db, o: { uid: string; repoId: string; body: z.infer<typeof HarnessApproveBody>; secondFactor: SecondFactor }): Promise<Result> {
  const hp = (await asService(db, (sql) => sql.query<Row>(
    "select h.org_id::text as org_id, h.repo_id::text as repo_id, h.status, h.policy_yaml, h.blocked, h.scan, r.config_version from public.harness_proposals h join public.repos r on r.id = h.repo_id where h.id = $1::uuid",
    [o.body.proposal_id],
  ))).rows[0];
  if (!hp || hp.repo_id !== o.repoId) return err(404, "unknown_proposal");
  if (!(await isOwner(db, o.uid, hp.org_id))) return err(403, "not_an_owner");
  if (hp.status !== "proposed") return err(409, "not_proposed");
  if (hp.blocked.length > 0) return err(409, "blocked_invisible_characters");
  if (!o.body.code) return err(403, "second_factor_required");
  const yaml = o.body.edited_yaml ?? hp.policy_yaml;
  if (findInvisible(yaml).length > 0) return err(400, "yaml_invisible_characters");
  const parsed = parseMandatYml(yaml);
  if (!parsed.ok) return err(400, "bad_yaml");
  if (classifyCommand(parsed.policy.tests.command) === "forbidden" || classifyCommand(parsed.policy.runtime.install) === "forbidden") return err(400, "forbidden_command");
  const mfaAt = await o.secondFactor({ uid: o.uid, code: o.body.code, factorId: o.body.factor_id });
  if (!mfaAt) return err(403, "second_factor_invalid");
  const sha = sha256Tag(yaml);
  const existing: Existing = hp.scan.existing ?? { ".mandat.yml": null, "AGENTS.md": null, "CLAUDE.md": null };
  const files = o.body.generate
    ? generateHarnessFiles({ policy: parsed.policy, scripts: hp.scan.scripts ?? {}, packageManager: hp.scan.package_manager ?? parsed.policy.runtime.package_manager, configSha256: sha, version: hp.config_version + 1, links: hp.scan.links ?? [], existingAgents: existing["AGENTS.md"], existingClaude: existing["CLAUDE.md"], yaml })
    : [{ path: ".mandat.yml", content: yaml, sha256: sha }];
  const generated = files.map((f) => ({ ...f, before: existing[f.path as keyof Existing] ?? null }));
  if (generated.some((f) => findInvisible(f.content).length > 0)) return err(400, "generated_invisible_characters");
  const taskTypes = Object.entries(parsed.policy.task_types).map(([name, t]) => ({ name, risk_class: t?.risk_class }));
  try {
    const version = await asService(db, async (sql) => (await sql.query<{ v: number }>("select private.approve_harness($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7::timestamptz) as v", [o.body.proposal_id, o.uid, yaml, sha, JSON.stringify(taskTypes), JSON.stringify(generated), mfaAt.toISOString()])).rows[0]?.v);
    return { status: 200, body: { version, yaml_sha256: sha, files: generated.map((f) => ({ path: f.path, sha256: f.sha256 })) } };
  } catch (e) {
    const c = pgCode(e);
    if (c === "42501") return err(403, "second_factor_rejected");
    if (c === "55000") return err(409, "not_proposed");
    throw e;
  }
}

export interface HarnessView {
  repos: { id: string; full_name: string; config_version: number; config_hash: string | null; harness_stale: boolean; proposal: { id: string; status: string; yaml: string; field_sources: Record<string, string>; blocked: string[]; needs_human: string[]; warnings: string[]; risk_cap: number | null; pr_number: number | null; version: number | null } | null; pending_scan: boolean }[];
}
export async function harnessView(db: Db, uid: string, org: string): Promise<HarnessView> {
  return asUser(db, uid, async (sql) => {
    const repos = (await sql.query<{ id: string; full_name: string; config_version: number; config_hash: string | null; harness_stale: boolean }>("select id::text as id, full_name, config_version, config_hash, harness_stale from public.repos where org_id = $1::uuid order by full_name", [org])).rows;
    const out: HarnessView["repos"] = [];
    for (const r of repos) {
      const p = (await sql.query<{ id: string; status: string; policy_yaml: string; field_sources: Record<string, string>; blocked: string[]; needs_human: string[]; warnings: string[]; risk_cap: number | null; pr_number: number | null; version: number | null }>(
        "select id::text as id, status, policy_yaml, field_sources, blocked, needs_human, warnings, risk_cap, pr_number, version from public.harness_proposals where repo_id = $1::uuid order by created_at desc limit 1",
        [r.id],
      )).rows[0];
      out.push({ ...r, proposal: p ? { id: p.id, status: p.status, yaml: p.policy_yaml, field_sources: p.field_sources, blocked: p.blocked, needs_human: p.needs_human, warnings: p.warnings, risk_cap: p.risk_cap, pr_number: p.pr_number, version: p.version } : null, pending_scan: false });
    }
    return { repos: out };
  });
}
