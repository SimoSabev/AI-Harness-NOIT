import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { McpServerRef } from "@mandat/contract";
import { listRegistry, refFromRegistry } from "./registry.js";

// E8e (v5 p. 4.5 (2), D-354): the official registry is a discovery index, not a trust anchor; a server is added with
// an exact version (never "latest") and is vetted before any agent sees it.
const page = readFileSync(path.resolve(import.meta.dirname, "../../../fixtures/mcp-registry/servers-page.json"), "utf8");
const fetchOk = (calls: string[]) => (url: string) => {
  calls.push(url);
  return Promise.resolve(new Response(page, { status: 200, headers: { "content-type": "application/json" } }));
};

describe("MCP registry client", () => {
  it("lists /v0.1/servers (limit, cursor) and filters by text; one row per name with its versions", async () => {
    const calls: string[] = [];
    const r = await listRegistry({ fetch: fetchOk(calls), query: "issues", limit: 50 });
    expect(calls[0]).toBe("https://registry.modelcontextprotocol.io/v0.1/servers?limit=50");
    expect(r.map((x) => [x.name, x.versions])).toEqual([["io.github.example/issues", ["1.4.2", "1.3.0"]]]);
  });
  it("an exact version → an McpServerRef (stdio: the pinned npm package, secrets by name); latest/unknown → error", async () => {
    const all = await listRegistry({ fetch: fetchOk([]), query: "", limit: 50 });
    const issues = all.find((x) => x.name === "io.github.example/issues");
    const ref = refFromRegistry(issues!, "1.3.0", "issues");
    expect(McpServerRef.parse(ref)).toEqual(ref);
    expect(ref).toMatchObject({ name: "issues", transport: "stdio", package: "@example/issues-mcp@1.3.0", version: "1.3.0", tools_hash: null, egress_hosts: [] });
    expect(refFromRegistry(issues!, "1.4.2", "issues").secrets).toEqual(["ISSUES_TOKEN"]);
    expect(() => refFromRegistry(issues!, "latest", "issues")).toThrow(/exact version/);
    expect(() => refFromRegistry(issues!, "9.9.9", "issues")).toThrow(/no version 9.9.9/);
    const remote = refFromRegistry(all.find((x) => x.name === "ac.inference.sh/mcp")!, "0.9.0", "inference");
    expect(remote).toMatchObject({ transport: "http", url: "https://mcp.inference.sh/mcp", egress_hosts: ["mcp.inference.sh"], package: null });
  });
  it("a broken or non-200 answer is an error, not an empty list", async () => {
    await expect(listRegistry({ fetch: () => Promise.resolve(new Response("{}", { status: 200 })), query: "", limit: 5 })).rejects.toThrow(/registry/);
    await expect(listRegistry({ fetch: () => Promise.resolve(new Response("x", { status: 503 })), query: "", limit: 5 })).rejects.toThrow(/503/);
  });
});
