import { McpServerRef, ProfileLayers, profileHash, ulid } from "@mandat/contract";
import type { Sha256 } from "@mandat/contract";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import type { Db } from "./db.js";
import { inTransaction } from "./db.js";
import type { EffectHandler } from "./outbox.js";

// E8e (v5 p. 4.5 (3), AC-5.1/5.2, D-354): after a person approves an MCP server, the worker runs it once without network
// (the sidecar bridge in --vet mode) and records the vetting. Clean → approved + the server enters layer E of every
// approved profile in its scope (a new version with tools_hash pinned); findings → blocked; the profile does not change.
export interface McpServerRow {
  id: string; org_id: string; name: string; transport: "stdio" | "http"; package: string | null; url: string | null; version: string | null;
  secrets: string[]; egress_hosts: string[]; enabled_tools: string[] | null; repo_ids: string[] | null; approved_by: string | null; tools_hash: string | null;
}
export interface McpVetResult {
  ok: boolean;
  hash: Sha256;
  findings: { tool: string; reason: string; match: string }[];
  definitions: { name: string; description_hash: string; schema_hash: string }[];
  /** npm integrity of the installed package (stdio) */
  digest: string | null;
}
export type McpVetRunner = (s: McpServerRow) => Promise<McpVetResult>;

const SERVER = `select id::text as id, org_id::text as org_id, name, transport, package, url, version, secrets, egress_hosts, enabled_tools,
  repo_ids::text[] as repo_ids, approved_by::text as approved_by, tools_hash from public.mcp_servers`;

export function refOf(s: McpServerRow, toolsHash: Sha256, digest: string | null): McpServerRef {
  return McpServerRef.parse({
    name: s.name, transport: s.transport, package: s.package, url: s.url, version: s.version ?? "0.0.0", digest, tools_hash: toolsHash,
    enabled_tools: s.enabled_tools, egress_hosts: s.egress_hosts, secrets: s.secrets,
  });
}

async function addToProfiles(tx: SqlClient, s: McpServerRow, ref: McpServerRef): Promise<number> {
  const rows = (await tx.query<{ repo_id: string; layers: unknown }>(
    `select r.id::text as repo_id, h.layers from public.repos r join public.harness_profiles h on h.id = r.profile_id and h.status = 'approved'
      where r.org_id = $1::uuid and ($2::uuid[] is null or r.id = any($2::uuid[])) order by r.id`,
    [s.org_id, s.repo_ids],
  )).rows;
  let n = 0;
  for (const r of rows) {
    const p = ProfileLayers.safeParse(r.layers);
    if (!p.success) continue;
    const layers = { ...p.data, e: { ...p.data.e, mcp: [...p.data.e.mcp.filter((m) => m.name !== ref.name), ref] } };
    await tx.query("select private.profile_layer_version($1::uuid, 'e', $2::jsonb, $3, $4::uuid, null, $5::jsonb)", [r.repo_id, JSON.stringify(layers), profileHash(layers), s.approved_by, JSON.stringify({ mcp: ref.name, tools_hash: ref.tools_hash })]);
    n++;
  }
  return n;
}

export async function vetMcpServer(d: { db: Db; vetRunner: McpVetRunner }, serverId: string): Promise<"approved" | "blocked"> {
  const s = (await d.db.query<McpServerRow>(`${SERVER} where id = $1::uuid`, [serverId])).rows[0];
  if (!s) throw new Error("mcp_vet: unknown server");
  const v = await d.vetRunner(s);
  return inTransaction(d.db, async (tx) => {
    if (!v.ok) {
      await tx.query("update public.mcp_servers set vet_status = 'blocked', vet_findings = $2::jsonb, tools_hash = $3, updated_at = now() where id = $1::uuid", [s.id, JSON.stringify(v.findings.slice(0, 50)), v.hash]);
      await appendLedgerOnline(tx, { org_id: s.org_id, kind: "mcp_change", task_id: null, payload: { action: "blocked", name: s.name, version: s.version, tools_hash: v.hash, findings: v.findings.slice(0, 20).map((f) => `${f.tool}:${f.reason}`) } });
      return "blocked";
    }
    await tx.query("update public.mcp_servers set vet_status = 'approved', vet_findings = '[]', tools_hash = $2, digest = $3, tools = $4, approved_at = now(), updated_at = now() where id = $1::uuid", [s.id, v.hash, v.digest, v.definitions.length]);
    await tx.query("delete from public.mcp_tool_defs where server_id = $1::uuid", [s.id]);
    for (const t of v.definitions.slice(0, 1000)) {
      await tx.query("insert into public.mcp_tool_defs (server_id, org_id, name, description_hash, schema_hash) values ($1::uuid, $2::uuid, $3, $4, $5)", [s.id, s.org_id, t.name, t.description_hash, t.schema_hash]);
    }
    const versions = await addToProfiles(tx, s, refOf(s, v.hash, v.digest));
    await appendLedgerOnline(tx, { org_id: s.org_id, kind: "mcp_change", task_id: null, payload: { action: "approved", name: s.name, version: s.version, tools_hash: v.hash, digest: v.digest, profile_versions: versions } });
    return "approved";
  });
}

/** A sidecar refused to serve (another hash than the approved one, or tools/list_changed): the server is blocked until re-approved. */
export async function recordMcpBlocked(db: Db, o: { org: string; name: string; reason: string; hash: string; runId: string | null; taskId: string | null }): Promise<void> {
  await inTransaction(db, async (tx) => {
    await tx.query("update public.mcp_servers set vet_status = 'blocked', updated_at = now() where org_id = $1::uuid and name = $2", [o.org, o.name]);
    await tx.query("insert into public.security_events (id, org_id, task_id, run_id, kind, severity, detail, source) values ($1, $2::uuid, $3, $4, 'mcp_definition_changed', 'warn', $5::jsonb, 'worker')", [`se_${ulid()}`, o.org, o.taskId, o.runId, JSON.stringify({ name: o.name, reason: o.reason, hash: o.hash })]);
    await appendLedgerOnline(tx, { org_id: o.org, kind: "mcp_change", task_id: o.taskId, payload: { action: "blocked_at_start", name: o.name, reason: o.reason, tools_hash: o.hash } });
  });
}

export function mcpHandlers(d: { db: Db; vetRunner: McpVetRunner }): { mcp_vet: EffectHandler } {
  return {
    mcp_vet: async (row) => {
      const id = String(row.payload.server_id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("mcp_vet without server_id");
      await vetMcpServer(d, id);
    },
  };
}
