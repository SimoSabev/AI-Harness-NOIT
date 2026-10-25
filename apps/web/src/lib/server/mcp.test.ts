import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { addMcpServer, approveMcpServer, mcpCatalog } from "./mcp";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, webDb } from "./web-db.test-helper";

// E8e (v5 p. 4.5 (1)–(3), AC-5.1): add from the registry (exact version) or by hand; approve (tools.manage, a TOTP code
// when the server reaches beyond localhost) → vetting by the worker (outbox mcp_vet). Nothing reaches an agent before that.
let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
const page = readFileSync(path.resolve(import.meta.dirname, "../../../../../fixtures/mcp-registry/servers-page.json"), "utf8");
const registry = () => Promise.resolve(new Response(page, { status: 200 }));
beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
});
afterAll(() => db.end());

describe("MCP catalog (web)", () => {
  it("approver lacks tools.manage → 403; owner adds from the registry with an exact version; latest → 400", async () => {
    const body = { source: "registry" as const, registry_name: "io.github.example/issues", version: "1.3.0", name: "issues" };
    expect((await addMcpServer(db, { uid: U.approver, org, body, fetch: registry })).status).toBe(403);
    expect((await addMcpServer(db, { uid: U.owner, org, body: { ...body, version: "latest" }, fetch: registry })).status).toBe(400);
    const r = await addMcpServer(db, { uid: U.owner, org, body, fetch: registry });
    expect(r.status).toBe(201);
    const c = await mcpCatalog(db, U.viewer, org);
    expect(c.find((s) => s.name === "issues")).toMatchObject({ vet_status: "pending", package: "@example/issues-mcp@1.3.0", version: "1.3.0", source: "registry" });
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.ledger where kind = 'mcp_change'")).rows[0]?.n).toBe(1);
  });
  it("by hand: an http server with its host; approve needs a TOTP code (egress beyond localhost) → vetting + outbox mcp_vet", async () => {
    const r = await addMcpServer(db, { uid: U.owner, org, body: { source: "manual", name: "remote", transport: "http", url: "https://mcp.example.com/mcp", version: "2.0.0", egress_hosts: ["mcp.example.com"], secrets: [] }, fetch: registry });
    const id = String(r.body.id);
    const sf = devSecondFactor(db);
    expect((await approveMcpServer(db, { uid: U.owner, id, body: {}, secondFactor: sf })).body).toEqual({ error: "second_factor_required" });
    const ok = await approveMcpServer(db, { uid: U.owner, id, body: { code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(ok).toMatchObject({ status: 200, body: { vet_status: "vetting" } });
    expect((await db.query("select kind, payload from public.outbox where kind = 'mcp_vet'")).rows).toEqual([{ kind: "mcp_vet", payload: { server_id: id } }]);
    expect((await approveMcpServer(db, { uid: U.owner, id, body: { code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(409);
  });
  it("a stdio server without egress is approved without a code", async () => {
    const id = (await mcpCatalog(db, U.owner, org)).find((s) => s.name === "issues")?.id ?? "";
    expect((await approveMcpServer(db, { uid: U.owner, id, body: {}, secondFactor: devSecondFactor(db) })).status).toBe(200);
  });
});
