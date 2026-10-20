import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { callTool, legacyHandshake, rpcClient } from "../../../scripts/mcp-call.mjs";

// т. 7.5 mcp-stdio-legacy / mcp-stdio-modern (D-239): the built server, spawned over stdio.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const main = path.join(repoRoot, "packages/mcp/dist/main.js");
const NAMES = ["mandat_explain", "mandat_status", "mandat_verify"];
function server(extra: string[] = [], env: Record<string, string> = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-mcp-t-"));
  execFileSync("git", ["init", "-q", path.join(tmp, "r")]);
  return rpcClient("node", [main, "--same-uid", "--allow", path.join(tmp, "r"), "--remote", "file:///nope.git", "--home", path.join(tmp, "h"), ...extra], { PATH: process.env.PATH ?? "", ...env });
}
const open: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  for (const c of open.splice(0)) await c.close();
});

describe("mcp-stdio-legacy (2025-11-25)", () => {
  it("initialize → същата версия → tools/list = трите имена → невалиден job_id → грешка; stdout = само JSON-RPC", async () => {
    const c = server();
    open.push(c);
    const init = (await legacyHandshake(c)) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(init.result.protocolVersion).toBe("2025-11-25");
    expect(init.result.serverInfo.name).toBe("mandat");
    const list = (await c.request("tools/list", {})) as { result: { tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[] } };
    expect(list.result.tools.map((t) => t.name).sort()).toEqual(NAMES);
    expect(Object.keys(list.result.tools.find((t) => t.name === "mandat_verify")?.inputSchema.properties ?? {}).sort()).toEqual(["repo_path", "task_type"]);
    const bad = await callTool(c, "mandat_status", { job_id: "nope" });
    expect(bad.error ?? (bad.isError ? "isError" : null)).toBeTruthy();
    const unknown = await callTool(c, "mandat_status", { job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0" });
    expect(unknown).toMatchObject({ isError: true, value: { error: "unknown job" } });
    for (const l of c.lines) expect(JSON.parse(l)).toMatchObject({ jsonrpc: "2.0" });
  });
});

describe("mcp-stdio-modern (2026-07-28)", () => {
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
  it("server/discover → supportedVersions ∋ 2026-07-28 → tools/list със същия _meta", async () => {
    const c = server();
    open.push(c);
    const d = (await c.request("server/discover", {}, meta)) as { result?: { supportedVersions?: string[] }; error?: unknown };
    expect(d.result?.supportedVersions).toContain("2026-07-28");
    const list = (await c.request("tools/list", {}, meta)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name).sort()).toEqual(NAMES);
  });
  it("initialize с 2026-07-28 не се приема като modern", async () => {
    const c = server();
    open.push(c);
    const r = (await c.request("initialize", { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "t", version: "1" } })) as { result?: { protocolVersion: string }; error?: unknown };
    expect(r.error !== undefined || r.result?.protocolVersion !== "2026-07-28").toBe(true);
  });
});

describe("mcp-no-secrets / allowlist при старт", () => {
  it("SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY в env → exit 2; празен allowlist, `--allow .`, --allow-project-dir без env → exit 2", async () => {
    for (const env of [{ SUPABASE_SERVICE_ROLE_KEY: "x" }, { ANTHROPIC_API_KEY: "x" }, { GITHUB_WRITER_PRIVATE_KEY: "x" }]) {
      const c = server([], env);
      expect(await c.exited).toBe(2);
      expect(c.stderr()).toContain("secrets not allowed in MCP env");
    }
    for (const args of [[], ["--allow", ".", "--remote", "x"], ["--allow-project-dir", "--remote", "x"]]) {
      const c = rpcClient("node", [main, ...args], { PATH: process.env.PATH ?? "" });
      expect(await c.exited).toBe(2);
    }
  });
});
