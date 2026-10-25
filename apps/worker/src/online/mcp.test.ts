import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HarnessProfile, demoProfileLayers, sealProfile } from "@mandat/contract";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { mcpHandlers, recordMcpBlocked } from "./mcp.js";
import type { McpVetRunner } from "./mcp.js";

// E8e (v5 p. 4.5 (3), AC-5.1/5.2, D-354): outbox mcp_vet → the server runs once without network and its definitions are
// vetted. Clean → approved, tools_hash + per-tool hashes, ledger mcp_change, the server enters layer E of every approved
// profile in its scope (a new version, tools_hash pinned). Findings → blocked, the profile does not change.
let db: Awaited<ReturnType<typeof pgliteDb>>;
const H = `sha256:${"e".repeat(64)}`;
const defs = [{ name: "create_issue", description_hash: `sha256:${"a".repeat(64)}`, schema_hash: `sha256:${"b".repeat(64)}` }];
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  const p = sealProfile({ version: 1, repo_id: DEMO_REPO_ID, layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
  const id = (await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, $3::jsonb, '{}', $4, 'approved', now()) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(p.layers), p.profile_hash])).rows[0]?.id;
  await db.query("update public.repos set profile_id = $2 where id = $1", [DEMO_REPO_ID, id]);
});
afterAll(() => db.end());

const server = async (name: string) =>
  (await db.query<{ id: string }>("insert into public.mcp_servers (org_id, name, transport, source, package, version, secrets, egress_hosts, vet_status, approved_by) values ($1, $2, 'stdio', 'registry', $3, '1.3.0', '{ISSUES_TOKEN}', '{api.example.com}', 'vetting', $4) returning id::text as id", [DEMO_ORG_ID, name, `@example/${name}-mcp@1.3.0`, DEMO_OWNER_ID])).rows[0]?.id as string;
const row = (id: string) => ({ id: 1, org_id: DEMO_ORG_ID, kind: "mcp_vet" as const, idempotency_key: `mcp:${id}`, payload: { server_id: id }, attempts: 0 });
const approved = async () => {
  const r = (await db.query<{ version: number; layers: unknown; sources: unknown; profile_hash: string }>("select h.version, h.layers, h.sources, h.profile_hash from public.repos r join public.harness_profiles h on h.id = r.profile_id where r.id = $1", [DEMO_REPO_ID])).rows[0];
  return HarnessProfile.parse({ version: r?.version, repo_id: DEMO_REPO_ID, layers: r?.layers, sources: r?.sources, profile_hash: r?.profile_hash, approved_by: null, approved_at: null });
};

describe("mcp_vet (AC-5.1)", () => {
  it("clean → approved with the hashes; ledger; layer E of the approved profile gets the server with tools_hash pinned", async () => {
    const id = await server("issues");
    const runner: McpVetRunner = () => Promise.resolve({ ok: true, hash: H, findings: [], definitions: defs, digest: "sha512-abc" });
    await mcpHandlers({ db, vetRunner: runner }).mcp_vet(row(id));
    const s = (await db.query<{ vet_status: string; tools_hash: string; digest: string; approved_at: string | null }>("select vet_status, tools_hash, digest, approved_at::text as approved_at from public.mcp_servers where id = $1", [id])).rows[0];
    expect(s).toMatchObject({ vet_status: "approved", tools_hash: H, digest: "sha512-abc" });
    expect(s?.approved_at).not.toBeNull();
    expect((await db.query("select name from public.mcp_tool_defs where server_id = $1", [id])).rows).toEqual([{ name: "create_issue" }]);
    expect((await db.query<{ payload: { action: string; tools_hash: string } }>("select payload from public.ledger where kind = 'mcp_change'")).rows.map((r) => r.payload)).toEqual([expect.objectContaining({ action: "approved", name: "issues", tools_hash: H })]);
    const p = await approved();
    expect(p.version).toBe(2);
    expect(p.layers.e.mcp.find((m) => m.name === "issues")).toMatchObject({ transport: "stdio", package: "@example/issues-mcp@1.3.0", tools_hash: H, secrets: ["ISSUES_TOKEN"], egress_hosts: ["api.example.com"] });
  });
  it("findings → blocked with the findings; the profile does not change (AC-5.2)", async () => {
    const id = await server("poisoned");
    const runner: McpVetRunner = () => Promise.resolve({ ok: false, hash: H, findings: [{ tool: "add", reason: "instruction", match: "ignore previous" }], definitions: defs, digest: null });
    await mcpHandlers({ db, vetRunner: runner }).mcp_vet(row(id));
    expect((await db.query("select vet_status, vet_findings from public.mcp_servers where id = $1", [id])).rows[0]).toEqual({ vet_status: "blocked", vet_findings: [{ tool: "add", reason: "instruction", match: "ignore previous" }] });
    expect((await approved()).version).toBe(2);
  });
  it("a block at run time (changed hash / list_changed) → blocked, security_event mcp_definition_changed, ledger", async () => {
    await recordMcpBlocked(db, { org: DEMO_ORG_ID, name: "issues", reason: "list_changed", hash: `sha256:${"f".repeat(64)}`, runId: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", taskId: null });
    expect((await db.query("select vet_status from public.mcp_servers where name = 'issues'")).rows[0]).toEqual({ vet_status: "blocked" });
    expect((await db.query<{ kind: string }>("select kind from public.security_events")).rows.map((r) => r.kind)).toEqual(["mcp_definition_changed"]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.ledger where kind = 'mcp_change'")).rows[0]?.n).toBe(3);
  });
});
