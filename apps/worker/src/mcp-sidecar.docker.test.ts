import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { demoProfileLayers, sealProfile } from "@mandat/contract";
import { buildShopFixture } from "./index.js";
import { vetMcpDocker } from "./mcp-vet-docker.js";
import { runTask } from "./run.js";
import { dockerEnv, repoRoot } from "./testing.js";

// E8e (v5 p. 4.5 (3)–(4), AC-5.1/5.3, D-354): a stdio MCP server is vetted with no network, then runs in its own sidecar.
// The agent calls it only through the gate; the server has no work tree, no LLM key, no internet; its secret is only in
// the sidecar.
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-mcp-"));
let tarball: Buffer;
beforeAll(async () => {
  await dockerEnv();
  buildShopFixture({ repoRoot, mandatHome: home, force: false });
  const out = mkdtempSync(path.join(os.tmpdir(), "mandat-mcp-pkg-"));
  execFileSync("npm", ["pack", "--silent", "--pack-destination", out, path.join(repoRoot, "fixtures/mcp-fake-pkg")], { encoding: "utf8" });
  tarball = readFileSync(path.join(out, readdirSync(out).find((f) => f.endsWith(".tgz")) ?? ""));
});

describe("MCP sidecar (docker)", () => {
  it("vetting without network: a hash, two tools, no findings, the npm digest", async () => {
    const row = { id: "x", org_id: "x", name: "probe", transport: "stdio" as const, package: "@mandat-fixture/fake-mcp@1.0.0", url: null, version: "1.0.0", secrets: ["FAKE_SECRET_TOKEN"], egress_hosts: [], enabled_tools: null, repo_ids: null, approved_by: null, tools_hash: null };
    const v = await vetMcpDocker(row, { mandatHome: home, repoRoot, env: process.env, tarball });
    expect(v.ok).toBe(true);
    expect(v.definitions.map((d) => d.name)).toEqual(["create_issue", "probe"]);
    expect(v.hash).toMatch(/^sha256:/);
    // the run: the vetted hash pinned in layer E; the agent (fake:mcp-probe) uses it through the gate
    const l = demoProfileLayers();
    const ref = { name: "probe", transport: "stdio" as const, package: "@mandat-fixture/fake-mcp@1.0.0", url: null, version: "1.0.0", digest: null, tools_hash: v.hash, enabled_tools: null, egress_hosts: [], secrets: ["FAKE_SECRET_TOKEN"] };
    const profile = sealProfile({ version: 1, repo_id: "local", layers: { ...l, e: { ...l.e, mcp: [ref] } }, sources: {}, approved_by: null, approved_at: null });
    const blocked: string[] = [];
    const r = await runTask({
      home, contractPath: path.join(repoRoot, "contracts/fix-discount.json"), agent: "fake:mcp-probe", keep: false, json: true, profile,
      mcpSecrets: { probe: { FAKE_SECRET_TOKEN: "s3cr3t-mcp" } }, hooks: { onMcpBlocked: (b) => blocked.push(b.name) },
      internals: { mcpTarballs: { probe: tarball } },
    });
    const notes = JSON.parse(readFileSync(path.join(r.runDir ?? "", "notes.txt"), "utf8")) as { tools: string[]; probe: { work_entries: number; llm_key: boolean; own_secret: boolean; net: string }; agent_has_secret: boolean };
    expect(notes.tools).toEqual(["create_issue", "probe"]);
    // /m/work exists in the image as an empty folder: none of the agent's tree is there
    expect(notes.probe).toEqual({ work_entries: 0, llm_key: false, own_secret: true, net: "blocked" });
    expect(notes.agent_has_secret).toBe(false);
    expect(blocked).toEqual([]);
    const h = JSON.parse(readFileSync(path.join(r.runDir ?? "", "harness.json"), "utf8")) as { mcp_serving: string[] };
    expect(h.mcp_serving).toEqual(["probe"]);
    expect(r.verdict?.result).toBe("VERIFIED");
  }, 900_000);
});
