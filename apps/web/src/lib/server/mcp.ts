import { z } from "zod";
import { McpServerRef, jcs, sha256Tag } from "@mandat/contract";
import { listRegistry, refFromRegistry } from "@mandat/mcp-bridge/registry";
import { factorAt } from "./actions";
import type { Result, SecondFactor } from "./actions";
import { hasCap } from "./roles";
import { asService, asUser } from "./sql";
import type { Db, Sql } from "./sql";

// E8e (v5 p. 4.5 (1)–(3), AC-5.1, D-354): the MCP catalog of the org. Added from the official registry (exact version) or
// by hand; approved by tools.manage (a fresh TOTP when the server reaches beyond localhost); the worker then vets it.
const VERSION = z.string().regex(/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/);
const NAME = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);
export const AddMcpBody = z.discriminatedUnion("source", [
  z.object({ source: z.literal("registry"), registry_name: z.string().min(1).max(200), version: VERSION, name: NAME }).strict(),
  z.object({
    source: z.literal("manual"), name: NAME, transport: z.enum(["stdio", "http"]), package: z.string().max(200).optional(), url: z.string().url().max(500).optional(), version: VERSION,
    egress_hosts: z.array(z.string().regex(/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/)).max(50), secrets: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(20),
  }).strict(),
]);
export const ApproveMcpBody = z.object({ factor_id: z.string().max(100).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict();

export interface McpRow { id: string; name: string; source: string; transport: string; package: string | null; url: string | null; version: string | null; vet_status: string; vet_findings: { tool: string; reason: string }[]; egress_hosts: string[]; secrets: string[]; tools: number; tools_hash: string | null }

const err = (status: number, error: string): Result => ({ status, body: { error } });
async function ledger(sql: Sql, org: string, payload: Record<string, unknown>): Promise<void> {
  const text = jcs(payload);
  await sql.query("select private.ledger_append($1::uuid, 'mcp_change', null, $2, $3)", [org, text, sha256Tag(text)]);
}
const LOCAL = /^(localhost|127\.0\.0\.1|egress-gate)$/;
/** Reaching beyond the machine (a remote URL or an egress host) needs a second factor at approval. */
export const reachesOut = (s: { transport: string; url: string | null; egress_hosts: string[] }) => s.egress_hosts.some((h) => !LOCAL.test(h)) || (s.transport === "http" && s.url !== null && !LOCAL.test(new URL(s.url).hostname));

export async function mcpCatalog(db: Db, uid: string, org: string): Promise<McpRow[]> {
  return asUser(db, uid, async (sql) => (await sql.query<McpRow>(
    "select id::text as id, name, source, transport, package, url, version, vet_status, vet_findings, egress_hosts, secrets, tools, tools_hash from public.mcp_servers where org_id = $1::uuid order by name",
    [org],
  )).rows);
}

export async function addMcpServer(db: Db, o: { uid: string; org: string; body: unknown; fetch: (url: string) => Promise<Response> }): Promise<Result> {
  const b = AddMcpBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  if (!(await hasCap(db, o.uid, o.org, "tools.manage"))) return err(403, "not_allowed");
  let ref: McpServerRef;
  let registryName: string | null = null;
  try {
    if (b.data.source === "registry") {
      const name = b.data.registry_name;
      const found = (await listRegistry({ fetch: o.fetch, query: name, limit: 100 })).find((x) => x.name === name);
      if (!found) return err(404, "not_in_registry");
      ref = refFromRegistry(found, b.data.version, b.data.name);
      registryName = name;
    } else {
      ref = McpServerRef.parse({ name: b.data.name, transport: b.data.transport, package: b.data.package ?? null, url: b.data.url ?? null, version: b.data.version, digest: null, tools_hash: null, enabled_tools: null, egress_hosts: b.data.egress_hosts, secrets: b.data.secrets });
    }
  } catch (e) {
    return err(400, e instanceof Error && /version/.test(e.message) ? "bad_version" : "bad_server");
  }
  const id = await asService(db, async (sql) => {
    const r = await sql.query<{ id: string }>(
      `insert into public.mcp_servers (org_id, name, transport, source, registry_name, package, url, version, egress_hosts, secrets, status, vet_status)
       values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'off', 'pending') on conflict (org_id, name) do nothing returning id::text as id`,
      [o.org, ref.name, ref.transport, b.data.source, registryName, ref.package, ref.url, ref.version, ref.egress_hosts, ref.secrets],
    );
    const row = r.rows[0];
    if (row) await ledger(sql, o.org, { action: "add", name: ref.name, source: b.data.source, version: ref.version, by: o.uid });
    return row?.id ?? null;
  });
  if (!id) return err(409, "name_taken");
  return { status: 201, body: { id, vet_status: "pending" } };
}

export async function approveMcpServer(db: Db, o: { uid: string; id: string; body: z.infer<typeof ApproveMcpBody>; secondFactor: SecondFactor }): Promise<Result> {
  const s = (await asService(db, (sql) => sql.query<{ org_id: string; name: string; transport: string; url: string | null; egress_hosts: string[]; vet_status: string }>(
    "select org_id::text as org_id, name, transport, url, egress_hosts, vet_status from public.mcp_servers where id = $1::uuid", [o.id],
  ))).rows[0];
  if (!s) return err(404, "unknown_server");
  if (!(await hasCap(db, o.uid, s.org_id, "tools.manage"))) return err(403, "not_allowed");
  if (s.vet_status === "vetting" || s.vet_status === "approved") return err(409, "already_approved");
  let mfaAt: Date | null = null;
  if (reachesOut(s)) {
    const f = await factorAt(o.secondFactor, { uid: o.uid, code: o.body.code, factorId: o.body.factor_id });
    if (!("at" in f)) return f;
    mfaAt = f.at;
  }
  await asService(db, async (sql) => {
    await sql.query("update public.mcp_servers set vet_status = 'vetting', approved_by = $2::uuid, mfa_verified_at = $3::timestamptz, updated_at = now() where id = $1::uuid", [o.id, o.uid, mfaAt?.toISOString() ?? null]);
    await sql.query("insert into public.outbox (org_id, kind, idempotency_key, payload) values ($1::uuid, 'mcp_vet', $2, $3::jsonb) on conflict (idempotency_key) do nothing", [s.org_id, `mcp_vet:${o.id}:${Date.now()}`, JSON.stringify({ server_id: o.id })]);
    await ledger(sql, s.org_id, { action: "approve", name: s.name, by: o.uid, second_factor: mfaAt !== null });
  });
  return { status: 200, body: { vet_status: "vetting" } };
}
