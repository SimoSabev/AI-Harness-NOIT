import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMandatYml } from "@mandat/contract";
import { runCli } from "./cli.js";
import { repoRoot } from "./paths.js";

async function cli(args: string[]) {
  let stdout = "";
  const code = await runCli(["node", "mandat", ...args], { stdout: (s) => (stdout += s), stderr: () => undefined, env: {}, cwd: process.cwd() });
  return { code, stdout };
}

describe("mandat init (т. 8.2)", () => {
  it("demo-shop → .mandat.yml.proposed с колона source; .mandat.yml не се пипа; невалидна папка → 2", async () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "mandat-init-"));
    cpSync(path.join(repoRoot, "fixtures/demo-shop"), d, { recursive: true });
    const before = readFileSync(path.join(d, ".mandat.yml"), "utf8");
    const r = await cli(["init", "--repo", d]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("runtime.install            lockfile");
    expect(r.stdout).toContain("Not approved.");
    const proposed = readFileSync(path.join(d, ".mandat.yml.proposed"), "utf8");
    expect(proposed).toContain("install: npm ci --ignore-scripts  # source: lockfile");
    expect(parseMandatYml(proposed).ok).toBe(true);
    expect(readFileSync(path.join(d, ".mandat.yml"), "utf8")).toBe(before);
    expect(existsSync(path.join(d, "AGENTS.md"))).toBe(false);
    const j = await cli(["init", "--repo", d, "--json"]);
    expect(JSON.parse(j.stdout)).toMatchObject({ risk_cap: 3, needs_human: [], blocked: [] });
    expect((await cli(["init", "--repo", path.join(d, "nope")])).code).toBe(2);
  });
});
