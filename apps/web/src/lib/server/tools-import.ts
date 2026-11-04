import { z } from "zod";
import { ProfileLayers, jcs, profileHash, sha256Tag } from "@mandat/contract";
import type { SkillRef } from "@mandat/contract";
import { candidateRef, discoverLocal, fromServerJson, importGithub, importSmithery, parseMcpJson, remoteCandidate, resolveNpm } from "@mandat/mcp-bridge/import";
import type { Fetch, ImportCandidate, LocalIo, SkillCandidate } from "@mandat/mcp-bridge/import";
import { listRegistry } from "@mandat/mcp-bridge/registry";
import type { Result, SecondFactor } from "./actions";
import { approveMcpServer } from "./mcp";
import { hasCap } from "./roles";
import { asService } from "./sql";
import type { Db, Sql } from "./sql";

// D-480…D-485: "Add from…" — preview (nothing is written), then add the picked rows as PENDING catalog entries. An MCP
// server still needs an approval and the worker's vetting before any profile sees it; a skill needs an approval and is
// never approvable while blocked. "Use in Mandat" (approve: true) is the person's approval in the same click.
const Source = z.discriminatedUnion("source", [
  z.object({ source: z.literal("json"), text: z.string().min(2).max(200_000) } ),
  z.object({ source: z.literal("github"), url: z.string().min(3).max(500) }),
  z.object({ source: z.literal("npm"), spec: z.string().min(1).max(250) }),
  z.object({ source: z.literal("registry"), name: z.string().min(1).max(200), version: z.string().max(64).optional() }),
  z.object({ source: z.literal("catalog"), input: z.string().min(1).max(300) }),
  z.object({ source: z.literal("url"), url: z.string().min(8).max(500), name: z.string().max(64).optional() }),
  z.object({ source: z.literal("local") }),
]);
const Pick = z.object({ mcp: z.array(z.string().max(64)).max(50), skills: z.array(z.string().max(64)).max(30) }).strict();
const extra = { pick: Pick, approve: z.boolean().optional(), code: z.string().regex(/^\d{6}$/).optional(), factor_id: z.string().max(100).optional() };
export const ImportBody = Source.and(z.object(extra));
type SourceT = z.infer<typeof Source>;

export interface Preview { mcp: ImportCandidate[]; skills: SkillCandidate[]; commit: string | null }
const err = (status: number, error: string): Result => ({ status, body: { error } });
const SOURCE_COL: Record<SourceT["source"], string> = { json: "json", github: "github", npm: "npm", registry: "registry", catalog: "catalog", url: "url", local: "local" };
const RESOLVE_AT_MOST = 10;

/** a bare npm package from pasted JSON gets its exact version now (shown to the person before adding) */
async function resolveBare(fetch: Fetch, cs: ImportCandidate[]): Promise<ImportCandidate[]> {
  let n = 0;
  return Promise.all(cs.map(async (c) => {
    if (c.problem !== "needs_version" || !c.package || n++ >= RESOLVE_AT_MOST) return c;
    return resolveNpm({ fetch, spec: c.package, name: c.name, secrets: c.secrets, origin: c.origin }).catch(() => c);
  }));
}

interface Ctx { fetch: Fetch; local: LocalIo | null }
async function collect({ fetch, local }: Ctx, s: SourceT): Promise<Preview> {
  switch (s.source) {
    case "json":
      return { mcp: await resolveBare(fetch, parseMcpJson(s.text, "json")), skills: [], commit: null };
    case "local": {
      if (!local) throw new Error("local_only");
      const f = await discoverLocal(local);
      return { mcp: await resolveBare(fetch, f.mcp), skills: f.skills, commit: null };
    }
    case "github": {
      const g = await importGithub({ fetch, url: s.url });
      return { mcp: g.mcp, skills: g.skills, commit: g.commit };
    }
    case "npm":
      return { mcp: [await resolveNpm({ fetch, spec: s.spec })], skills: [], commit: null };
    case "registry": {
      const found = (await listRegistry({ fetch, query: s.name, limit: 100 })).find((x) => x.name === s.name);
      const entry = found?.entries.find((e) => e.version === (s.version ?? found.versions[0]));
      if (!entry) return { mcp: [], skills: [], commit: null };
      return { mcp: [fromServerJson(entry as unknown as Record<string, unknown>, "registry")], skills: [], commit: null };
    }
    case "catalog":
      return { mcp: [await importSmithery({ fetch, input: s.input })], skills: [], commit: null };
    case "url":
      return { mcp: [remoteCandidate(s.url, s.name || undefined)], skills: [], commit: null };
  }
}
const publicSkill = ({ text: _text, ...k }: SkillCandidate) => k;

export async function previewImport(o: { fetch: Fetch; body: unknown; local?: LocalIo | null }): Promise<Result> {
  const b = Source.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  try {
    const p = await collect({ fetch: o.fetch, local: o.local ?? null }, b.data);
    return { status: 200, body: { mcp: p.mcp, skills: p.skills.map(publicSkill), commit: p.commit } };
  } catch (e) {
    return err(400, e instanceof Error ? e.message.slice(0, 120) : "bad_source");
  }
}

async function ledger(sql: Sql, org: string, payload: Record<string, unknown>): Promise<void> {
  const text = jcs(payload);
  await sql.query("select private.ledger_append($1::uuid, 'mcp_change', null, $2, $3)", [org, text, sha256Tag(text)]);
}

async function addServer(sql: Sql, org: string, uid: string, source: string, c: ImportCandidate): Promise<string | null> {
  const ref = candidateRef(c);
  const r = await sql.query<{ id: string }>(
    `insert into public.mcp_servers (org_id, name, transport, source, package, url, version, egress_hosts, secrets, origin, status, vet_status)
     values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'off', 'pending') on conflict (org_id, name) do nothing returning id::text as id`,
    [org, ref.name, ref.transport, source, ref.package, ref.url, ref.version, ref.egress_hosts, ref.secrets, c.origin.slice(0, 300)],
  );
  const id = r.rows[0]?.id ?? null;
  if (id) await ledger(sql, org, { action: "add", name: ref.name, source, origin: c.origin, version: ref.version, by: uid });
  return id;
}

async function addSkill(sql: Sql, org: string, k: SkillCandidate): Promise<string | null> {
  const r = await sql.query<{ id: string }>(
    `insert into public.skills (org_id, name, description, source, content_hash, approved, blocked_reason, content, origin)
     values ($1::uuid, $2, $3, 'user', $4, false, $5, $6, $7) on conflict (org_id, name) do nothing returning id::text as id`,
    [org, k.name, k.description, k.content_hash, k.blocked_reason, k.text, k.origin.slice(0, 300)],
  );
  return r.rows[0]?.id ?? null;
}

export async function importTools(db: Db, o: { uid: string; org: string; fetch: Fetch; body: unknown; secondFactor: SecondFactor; local?: LocalIo | null }): Promise<Result> {
  const b = ImportBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  if (!(await hasCap(db, o.uid, o.org, "tools.manage"))) return err(403, "not_allowed");
  const { pick, approve, code, factor_id, ...rest } = b.data;
  const src = rest as SourceT;
  let p: Preview;
  try {
    p = await collect({ fetch: o.fetch, local: o.local ?? null }, src); // re-read on the server: the client's preview is never trusted
  } catch (e) {
    return err(400, e instanceof Error ? e.message.slice(0, 120) : "bad_source");
  }
  const servers = p.mcp.filter((c) => c.problem === null && pick.mcp.includes(c.name));
  const skills = p.skills.filter((k) => pick.skills.includes(k.name));
  const added = await asService(db, async (sql) => {
    const m: { name: string; id: string | null }[] = [];
    for (const c of servers) m.push({ name: c.name, id: await addServer(sql, o.org, o.uid, SOURCE_COL[src.source], c) });
    const k: { name: string; id: string | null; blocked: boolean }[] = [];
    for (const x of skills) k.push({ name: x.name, id: await addSkill(sql, o.org, x), blocked: x.blocked_reason !== null });
    return { mcp: m, skills: k };
  });
  const mcp = [];
  for (const m of added.mcp) {
    if (!m.id) {
      mcp.push({ ...m, vet_status: "name_taken" });
      continue;
    }
    if (!approve) {
      mcp.push({ ...m, vet_status: "pending" });
      continue;
    }
    const a = await approveMcpServer(db, { uid: o.uid, id: m.id, body: { ...(code ? { code } : {}), ...(factor_id ? { factor_id } : {}) }, secondFactor: o.secondFactor });
    mcp.push({ ...m, vet_status: a.status === 200 ? "vetting" : String(a.body.error ?? "pending") });
  }
  const sk = [];
  for (const k of added.skills) {
    const ok = approve && k.id && !k.blocked ? (await approveSkill(db, { uid: o.uid, id: k.id })).status === 200 : false;
    sk.push({ ...k, approved: ok });
  }
  return { status: 201, body: { mcp, skills: sk } };
}

/** D-484: an approved imported skill enters layer E of every approved profile of the org (pinned by its hash). */
export async function approveSkill(db: Db, o: { uid: string; id: string }): Promise<Result> {
  const s = (await asService(db, (sql) => sql.query<{ org_id: string; name: string; description: string; content_hash: string | null; blocked_reason: string | null; approved: boolean; source: string; content: string | null }>(
    "select org_id::text as org_id, name, description, content_hash, blocked_reason, approved, source, content from public.skills where id = $1::uuid", [o.id],
  ))).rows[0];
  if (!s) return err(404, "unknown_skill");
  if (!(await hasCap(db, o.uid, s.org_id, "tools.manage"))) return err(403, "not_allowed");
  if (s.source !== "user" || s.blocked_reason !== null || !s.content_hash || s.content === null || sha256Tag(s.content) !== s.content_hash) return err(409, "skill_blocked");
  if (s.approved) return err(409, "already_approved");
  const ref: SkillRef = { name: s.name, source: "user", content_hash: s.content_hash as SkillRef["content_hash"], description: s.description.slice(0, 200) };
  const versions = await asService(db, async (sql) => {
    await sql.query("update public.skills set approved = true where id = $1::uuid", [o.id]);
    const rows = (await sql.query<{ repo_id: string; layers: unknown }>(
      "select r.id::text as repo_id, h.layers from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved' where r.org_id = $1::uuid order by r.id", [s.org_id],
    )).rows;
    let n = 0;
    for (const r of rows) {
      const p = ProfileLayers.safeParse(r.layers);
      if (!p.success || p.data.e.skills.length >= 60) continue;
      const layers = { ...p.data, e: { ...p.data.e, skills: [...p.data.e.skills.filter((k) => k.name !== ref.name), ref] } };
      await sql.query("select private.profile_layer_version($1::uuid, 'e', $2::jsonb, $3, $4::uuid, null, $5::jsonb)", [r.repo_id, JSON.stringify(layers), profileHash(layers), o.uid, JSON.stringify({ skill: ref.name, content_hash: ref.content_hash })]);
      n++;
    }
    return n;
  });
  return { status: 200, body: { approved: true, profile_versions: versions } };
}

/** D-485: the person's own clients on this machine — local mode only, after an explicit consent, read-only, no values. */
export async function discoverForPerson(o: { mode: string; body: unknown; io: LocalIo }): Promise<Result> {
  if (o.mode !== "local") return err(403, "local_only");
  const b = z.object({ consent: z.literal(true) }).strict().safeParse(o.body);
  if (!b.success) return err(400, "consent_required");
  const f = await discoverLocal(o.io);
  return { status: 200, body: { mcp: f.mcp, skills: f.skills.map(publicSkill), unreadable: f.unreadable } };
}
