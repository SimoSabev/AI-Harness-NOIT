import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startBridge } from "./bridge.js";
import type { Bridge } from "./bridge.js";
import { toolDefsHash } from "./vet.js";

// E8e (v5 p. 4.5 (4), D-354): the sidecar's bridge — a stdio MCP server behind streamable HTTP. It vets the definitions at
// start (poison or a hash other than the approved one → blocked, nothing is served) and blocks on tools/list_changed.
const FAKE = path.resolve(import.meta.dirname, "../test-fixtures/fake-server.mjs");
let b: Bridge | undefined;
afterEach(async () => {
  await b?.close();
  b = undefined;
});
const start = (mode: string, o: { approved?: string | null; enabled?: string[] | null; secret?: boolean } = {}) =>
  startBridge({ command: process.execPath, args: [FAKE], env: { FAKE_MCP_MODE: mode, ...(o.secret ? { FAKE_SECRET_TOKEN: "s3cr3t" } : {}) }, port: 0, host: "127.0.0.1", approvedHash: o.approved ?? null, enabledTools: o.enabled ?? null });
async function client(port: number) {
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  return c;
}

describe("stdio → streamable HTTP bridge", () => {
  it("clean: tools/list and tools/call pass through; enabled_tools filters; the secret stays in the server's env", async () => {
    b = await start("clean", { enabled: ["create_issue", "whoami"], secret: true });
    expect(b.status()).toMatchObject({ state: "serving", findings: [] });
    const c = await client(b.port);
    expect((await c.listTools()).tools.map((t) => t.name).sort()).toEqual(["create_issue", "whoami"]);
    const r = await c.callTool({ name: "create_issue", arguments: { title: "x" } });
    expect(r.content).toEqual([{ type: "text", text: "issue: x" }]);
    expect((await c.callTool({ name: "whoami", arguments: {} })).content).toEqual([{ type: "text", text: "FAKE_SECRET_TOKEN" }]);
    await c.close();
    const b2 = await start("clean", { enabled: ["whoami"] });
    const c2 = await client(b2.port);
    expect((await c2.listTools()).tools.map((t) => t.name)).toEqual(["whoami"]);
    await expect(c2.callTool({ name: "create_issue", arguments: { title: "x" } })).rejects.toThrow();
    await c2.close();
    await b2.close();
  });
  it("poisoned description → blocked at start with the tool named; every request gets 503", async () => {
    b = await start("poisoned");
    expect(b.status()).toMatchObject({ state: "blocked", reason: "findings" });
    expect(b.status().findings.map((f) => f.tool)).toEqual(["create_issue"]);
    const r = await fetch(`http://127.0.0.1:${b.port}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    expect(r.status).toBe(503);
  });
  it("a hash other than the approved one → blocked (changed); the approved hash → serving", async () => {
    b = await start("clean", { approved: `sha256:${"0".repeat(64)}` });
    expect(b.status()).toMatchObject({ state: "blocked", reason: "changed" });
    const h = b.status().hash;
    await b.close();
    b = await start("clean", { approved: h });
    expect(b.status().state).toBe("serving");
    expect(h).toBe(toolDefsHash((await (await client(b.port)).listTools()).tools));
  });
  it("rug pull: tools/list_changed after approval → blocked, with the new hash", async () => {
    b = await start("rug");
    const c = await client(b.port);
    await c.callTool({ name: "create_issue", arguments: { title: "x" } });
    await expect.poll(() => b?.status().state, { timeout: 5000 }).toBe("blocked");
    expect(b.status()).toMatchObject({ reason: "list_changed" });
    await c.close().catch(() => undefined);
  });
});
