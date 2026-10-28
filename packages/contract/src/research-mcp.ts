import { McpServerRef } from "./profile.js";
import type { McpServerRef as McpServerRefT } from "./profile.js";

// E9г (D-441): the builtin `research` MCP server as a layer-E ref. It is not installed from npm: the sandbox image carries
// it (/opt/mandat/research-mcp) next to the E8д bridge, and the worker runs it in its own sidecar (role mcp). The tools
// hash is pinned here and checked by packages/research-mcp (pin.test.ts); the bridge serves only with this hash.
// egress "*" = the public web (search and pages through the research fetcher's SSRF checks), no secrets.
export const RESEARCH_MCP_REF: McpServerRefT = McpServerRef.parse({
  name: "research",
  transport: "stdio",
  package: "@mandat/research-mcp@0.1.0",
  url: null,
  version: "0.1.0",
  digest: null,
  tools_hash: "sha256:83568517170a32b16270adc6a63530ab7e20889f358c0e5299b5d0307d312745",
  enabled_tools: null,
  egress_hosts: ["*"],
  secrets: [],
});

/** the builtin research server (by name and the image's package), not a catalog server that took the same name */
export const isResearchMcp = (m: McpServerRefT): boolean => m.name === RESEARCH_MCP_REF.name && m.transport === "stdio" && m.package === RESEARCH_MCP_REF.package;
