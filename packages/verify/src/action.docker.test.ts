import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAction } from "./action.js";
import { sh } from "./git-fixture.test-helper.js";

// D-366 for real: a PR checkout as actions/checkout leaves it (origin fetched, the PR head detached), the env a runner
// gives (GITHUB_*, RUNNER_TEMP, the summary and output files), the real sandbox. An honest PR is green; a deleted test is red.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function pr(change: (d: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-action-d-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const origin = path.join(root, "origin.git");
  sh(root, "clone", "-q", "--bare", seed, origin);
  const ws = path.join(root, "workspace");
  sh(root, "clone", "-q", origin, ws);
  sh(ws, "checkout", "-q", "-b", "agent/fix");
  change(ws);
  sh(ws, "add", "-A");
  sh(ws, "commit", "-qm", "agent");
  sh(ws, "checkout", "-q", "--detach");
  const summary = path.join(root, "summary.md");
  const output = path.join(root, "output.txt");
  writeFileSync(summary, "");
  writeFileSync(output, "");
  return { env: { ...process.env, GITHUB_WORKSPACE: ws, GITHUB_BASE_REF: "main", RUNNER_TEMP: root, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output, MANDAT_HOME: path.join(root, "home") }, summary, output };
}
const fix = (d: string) => writeFileSync(path.join(d, "src/cart.ts"), readFileSync(path.join(d, "src/cart.ts"), "utf8").replace("= 50000;", "= 5000;"));

describe("GitHub Action (docker)", () => {
  it("an honest PR → VERIFIED (exit 0); a PR that deletes the test → FAILED (exit 1) with the reason in words", async () => {
    let log = "";
    const io = { stdout: (s: string) => (log += s), stderr: () => undefined };
    const ok = pr(fix);
    expect(await runAction(ok.env, io, { repoRoot })).toBe(0);
    expect(readFileSync(ok.summary, "utf8")).toContain("## Mandat: VERIFIED");
    expect(readFileSync(ok.output, "utf8")).toContain("result=VERIFIED");
    const bad = pr((d) => {
      fix(d);
      writeFileSync(path.join(d, "tests/cart.spec.ts"), readFileSync(path.join(d, "tests/cart.spec.ts"), "utf8").replace(/ {2}it\("applies 10% over 50"[\s\S]*?\n {2}\}\);\n/, ""));
    });
    expect(await runAction(bad.env, io, { repoRoot })).toBe(1);
    const s = readFileSync(bad.summary, "utf8");
    expect(s).toContain("## Mandat: FAILED");
    expect(s).toContain("exists on base and is missing after the change");
    expect(log).toContain("::error title=Mandat FAILED::D2:missing_test:");
  }, 600_000);
});
