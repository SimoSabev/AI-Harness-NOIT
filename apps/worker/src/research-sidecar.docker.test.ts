import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESEARCH_MCP_REF, RESEARCH_TOOLS, demoProfileLayers, sealProfile } from "@mandat/contract";
import { realDockerRunner, dockerText, ensureUpstreamNetwork, imageTags } from "@mandat/sandbox";
import { buildShopFixture } from "./index.js";
import { runTask } from "./run.js";
import { dockerEnv, repoRoot } from "./testing.js";

// E9г (D-441): the builtin research server in the sandbox — its own sidecar (role mcp, from the image, the pinned tools
// hash), reached by the agent only as http://egress-gate/mcp/research. No external network: the sidecar searches a local
// SearXNG fixture on mandat-upstream only (--providers searxng). A search hit on a private address is not readable (the
// research fetcher's SSRF check inside the sidecar), a made-up URL is refused, research_ask says it needs the worker.
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-research-"));
const docker = realDockerRunner();
const sx = `mandat-test-sx-${randomBytes(4).toString("hex")}`;
const HITS = { results: [{ url: "https://www.rfc-editor.org/rfc/rfc8785", title: "RFC 8785", content: "JCS sorts keys by UTF-16 code units" }, { url: "http://10.0.0.5/admin", title: "internal", content: "JCS" }] };
const SERVER = `require("http").createServer((q,s)=>{s.writeHead(200,{"content-type":"application/json"});s.end(q.url.startsWith("/search")?${JSON.stringify(JSON.stringify(HITS))}:"{}")}).listen(8080,"0.0.0.0")`;

beforeAll(async () => {
  await dockerEnv();
  buildShopFixture({ repoRoot, mandatHome: home, force: false });
  await ensureUpstreamNetwork(docker);
  const image = (await imageTags(repoRoot)).sandbox;
  const r = await dockerText(docker, ["run", "-d", "--rm", "--name", sx, "--network", "mandat-upstream", "--cap-drop=ALL", "--read-only", "--user", "1000:1000", image, "node", "-e", SERVER], 60_000);
  expect(r.exitCode).toBe(0);
}, 300_000);
afterAll(async () => {
  await dockerText(docker, ["rm", "-f", sx], 60_000);
});

describe("research MCP in the sandbox (docker, D-441)", () => {
  it("the agent calls the research tools through the gate; the sidecar searches, refuses private and made-up URLs", async () => {
    const l = demoProfileLayers();
    const profile = sealProfile({ version: 1, repo_id: "local", layers: { ...l, e: { ...l.e, mcp: [RESEARCH_MCP_REF] } }, sources: {}, approved_by: null, approved_at: null });
    const blocked: string[] = [];
    const r = await runTask({
      home, contractPath: path.join(repoRoot, "contracts/fix-discount.json"), agent: "fake:research-probe", keep: false, json: true, profile,
      hooks: { onMcpBlocked: (b) => blocked.push(b.name) },
      internals: { researchArgs: ["--searxng", `http://${sx}:8080`, "--providers", "searxng"] },
    });
    const notes = JSON.parse(readFileSync(path.join(r.runDir ?? "", "notes.txt"), "utf8")) as {
      tools: string[]; hits: { url: string; provider: string; id: boolean }[]; read_private: { isError: boolean; value: { error: string } } | null;
      read_made_up: { isError: boolean; value: { error: string } }; ask: { isError: boolean; value: { error: string } }; error?: string;
    };
    expect(notes.error).toBeUndefined();
    expect(notes.tools).toEqual([...RESEARCH_TOOLS].sort());
    expect(notes.hits.map((h) => h.url).sort()).toEqual(["http://10.0.0.5/admin", "https://www.rfc-editor.org/rfc/rfc8785"]);
    expect(notes.hits.every((h) => h.provider === "searxng" && h.id)).toBe(true);
    expect(notes.read_private?.isError).toBe(true);
    expect(notes.read_private?.value.error).toMatch(/could not be read/);
    expect(notes.read_made_up.value.error).toMatch(/did not come from a research tool result/);
    expect(notes.ask.value.error).toMatch(/needs the harness worker/);
    expect(blocked).toEqual([]);
    const h = JSON.parse(readFileSync(path.join(r.runDir ?? "", "harness.json"), "utf8")) as { mcp_serving: string[] };
    expect(h.mcp_serving).toEqual(["research"]);
    // the gate saw the calls on the MCP route (and the sidecar is gone after the run)
    expect(readFileSync(path.join(r.runDir ?? "", "gate", "log", "events.jsonl"), "utf8").split("\n").some((x) => x.includes('"/mcp/research"'))).toBe(true);
    expect((await dockerText(docker, ["inspect", `mandat-mcp-${path.basename(r.runDir ?? "")}-research`], 30_000)).exitCode).not.toBe(0);
    expect(r.verdict?.result).toBe("VERIFIED");
  }, 1_200_000);
});
