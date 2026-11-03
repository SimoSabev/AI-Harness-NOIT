import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { RESEARCH_MCP_REF } from "@mandat/contract";
import { toolDefsHash } from "@mandat/mcp-bridge";
import { ResearchBackend } from "./backend.js";
import { createResearchServer } from "./server.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// D-441: the sandbox runs the research server from the image behind the E8д bridge; the bridge serves only when the tool
// definitions hash to the pinned RESEARCH_MCP_REF.tools_hash (a changed definition = a block, as for any MCP server).
describe("the research server in the sandbox (D-441)", () => {
  it("the pinned tools hash is the hash of what the server lists", async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const s = createResearchServer(new ResearchBackend({ providers: [], fetcher: { fetch: async () => null } as never, queue: null }));
    await s.connect(b);
    const c = new Client({ name: "t", version: "1" });
    await c.connect(a);
    const tools = (await c.listTools()).tools;
    expect(toolDefsHash(tools)).toBe(RESEARCH_MCP_REF.tools_hash);
    await c.close();
  });
  it("its runtime dependencies stay small enough for the image: no worker, no Docker", () => {
    const pj = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pj.dependencies)).not.toContain("@mandat/worker");
    expect(Object.keys(pj.dependencies)).not.toContain("@mandat/sandbox");
  });
  it("argv: --searxng and --providers choose the engines (the sidecar points at mandat-searxng)", async () => {
    const { providersFromArgs } = await import("./args.js");
    expect(providersFromArgs([], {}).searxngUrl).toBe("http://127.0.0.1:8888");
    const o = providersFromArgs(["--searxng", "http://mandat-searxng:8080", "--providers", "searxng"], {});
    expect(o).toEqual({ searxngUrl: "http://mandat-searxng:8080", only: ["searxng"] });
    expect(() => providersFromArgs(["--providers", "google"], {})).toThrow(/unknown provider/);
    expect(() => providersFromArgs(["--searxng", "file:///etc/passwd"], {})).toThrow(/http/);
  });
});
