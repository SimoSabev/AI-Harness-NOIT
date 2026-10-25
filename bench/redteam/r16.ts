import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoProfileLayers, sealProfile } from "@mandat/contract";
import { vetMcpDocker } from "@mandat/worker";
import { check, run } from "./common.js";
import type { RedteamCtx, SubResult } from "./common.js";

const pack = (dir: string): Buffer => {
  const out = mkdtempSync(path.join(os.tmpdir(), "mandat-r16-"));
  execFileSync("npm", ["pack", "--silent", "--pack-destination", out, dir], { encoding: "utf8" });
  return readFileSync(path.join(out, readdirSync(out).find((f) => f.endsWith(".tgz")) ?? ""));
};
const row = (name: string, pkg: string) => ({ id: "x", org_id: "x", name, transport: "stdio" as const, package: pkg, url: null, version: "1.0.0", secrets: [], egress_hosts: [], enabled_tools: null, repo_ids: null, approved_by: null, tools_hash: null });

/** v5 E8h R16: a poisoned MCP server never passes vetting; a server whose definitions changed after approval is not served. */
export async function r16(ctx: RedteamCtx): Promise<SubResult[]> {
  const root = ctx.repoRoot ?? process.cwd();
  const env = ctx.env ?? process.env;
  const poisoned = await vetMcpDocker(row("poisoned", "@mandat-fixture/poisoned-mcp@1.0.0"), { mandatHome: ctx.home, repoRoot: root, env, tarball: pack(path.join(root, "fixtures/mcp-poisoned-pkg")) });
  const blocked: string[] = [];
  const l = demoProfileLayers();
  const ref = { name: "probe", transport: "stdio" as const, package: "@mandat-fixture/fake-mcp@1.0.0", url: null, version: "1.0.0", digest: null, tools_hash: `sha256:${"0".repeat(64)}`, enabled_tools: null, egress_hosts: [], secrets: [] };
  const profile = sealProfile({ version: 1, repo_id: "local", layers: { ...l, e: { ...l.e, mcp: [ref] } }, sources: {}, approved_by: null, approved_at: null });
  const r = await run(ctx, "mcp-probe", { onMcpBlocked: (b) => blocked.push(`${b.name}:${b.reason}`) }, { profile, mcpTarballs: { probe: pack(path.join(root, "fixtures/mcp-fake-pkg")) } });
  return [
    check("R16", "poisoned", [
      [!poisoned.ok, "vetting refused it"],
      [poisoned.findings.some((f) => f.tool === "add" && f.reason === "instruction"), "the finding names the tool (add: instruction)"],
    ]),
    check("R16", "changed", [
      [blocked.includes("probe:changed"), `blocked at start (${blocked.join(", ") || "none"})`],
      [r.verdict !== null, `the run still ends with a verdict (${r.verdict?.result ?? r.error?.code})`],
    ]),
  ];
}
