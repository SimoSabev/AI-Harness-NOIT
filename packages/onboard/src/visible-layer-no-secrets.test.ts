import { describe, expect, it } from "vitest";
import { FIXTURES, memView } from "./fixtures.test-helper.js";
import { generateHarnessFiles, propose, proposeProfile, renderAgentsBlock, scanRepo } from "./index.js";

// D-311: the visible layer (in the repo: the AGENTS.md block, CLAUDE.md, .mandat.yml) never carries permissions, hooks,
// MCP servers or secrets — those live only in the control layer under /m/in/harness.
describe("visible layer without control (E8б)", () => {
  it("AGENTS.md, CLAUDE.md and .mandat.yml contain no permissions, hooks, MCP config or secrets", () => {
    const scan = scanRepo(memView(FIXTURES["npm-vitest"]));
    const p = propose(scan);
    const prof = proposeProfile(scan, { repoId: "local", version: 1 }).profile;
    const files = generateHarnessFiles({ ...agentsInput(p), existingAgents: null, existingClaude: null, yaml: p.yaml });
    const all = files.map((f) => f.content).join("\n");
    for (const bad of ["permissions", "hooks", "PreToolUse", "mcpServers", "mcp_servers", "deny-by-policy", "/opt/mandat/hooks", "sk-ant", "mdt_", "Bearer "]) expect(all).not.toContain(bad);
    for (const r of prof.layers.c) expect(all).not.toContain(r.tool);
    expect(all.split("\n").length).toBeGreaterThan(3);
  });
  function agentsInput(p: ReturnType<typeof propose>): Parameters<typeof renderAgentsBlock>[0] {
    return { policy: p.policy, scripts: { test: "vitest run", lint: "eslint ." }, packageManager: "npm", configSha256: p.sha256, version: 1, links: [] };
  }
});
