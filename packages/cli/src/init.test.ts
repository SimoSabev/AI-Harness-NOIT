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
  it("demo export-repo (т. 9.1): git хранилище без remote; непразна папка → 2", async () => {
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-exp-")), "shop");
    const r = await cli(["--home", mkdtempSync(path.join(os.tmpdir(), "mandat-exp-home-")), "demo", "export-repo", "--out", out]);
    expect(r.code).toBe(0);
    expect(existsSync(path.join(out, ".github/workflows/ci.yml"))).toBe(true);
    expect(existsSync(path.join(out, ".mandat.yml"))).toBe(true);
    const { execFileSync } = await import("node:child_process");
    expect(execFileSync("git", ["remote"], { cwd: out, encoding: "utf8" }).trim()).toBe("");
    expect(execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: out, encoding: "utf8" }).trim()).toBe("main");
    expect((await cli(["demo", "export-repo", "--out", out])).code).toBe(2);
  });
});

describe("mandat init --baseline (E7г)", () => {
  it("prints the baseline and the flaky IDs; 0 tests → a suggested first task", async () => {
    const { initCommand } = await import("./commands/init.js");
    const d = mkdtempSync(path.join(os.tmpdir(), "init-bl-"));
    cpSync(path.join(repoRoot, "fixtures", "demo-shop"), d, { recursive: true, filter: (p) => !p.includes("node_modules") });
    let out = "";
    const io = { stdout: (s: string) => (out += s), stderr: () => undefined, env: {}, cwd: process.cwd() };
    const flaky = "tests/cart.spec.ts > cart > total";
    await initCommand(io, { repo: d, json: false, baseline: true, runBaseline: () => Promise.resolve({ status: "ok", test_ids_count: 7, skipped: 1, duration_s: 3, report_valid: true, flaky: [flaky] }) });
    expect(out).toContain(`baseline: ok · 7 tests · 1 skipped · 3 s · flaky 1 (${flaky})`);
    out = "";
    await initCommand(io, { repo: d, json: false, baseline: true, runBaseline: () => Promise.resolve({ status: "ok", test_ids_count: 0, skipped: 0, duration_s: 1, report_valid: true, flaky: [] }) });
    expect(out).toContain("suggested first task (feature): Add tests");
  });
});
