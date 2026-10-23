import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actionExit, actionInputs, annotations, outputsOf, prepareBase, renderSummary, runAction } from "./action.js";
import { sh } from "./git-fixture.test-helper.js";
import { okDocker, simRunTests } from "./shop-sim.test-helper.js";

// The GitHub Action (`uses: <this repo>@<ref>`): mandat-verify on a pull request. The trusted base is the PR's base branch
// as actions/checkout fetched it (refs/remotes/origin/<base>), copied into a bare repo outside the workspace; the verdict
// goes to the job summary, step outputs and annotations; the exit code follows `fail-on`.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const IMAGES = { sandbox: "s:t", gate: "g:t", proxy: "p:t" };

/** A PR checkout as actions/checkout leaves it: a clone of the origin, the PR head detached, origin/main fetched. */
function prCheckout(change: (dir: string) => void): { root: string; workspace: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-action-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const origin = path.join(root, "origin.git");
  sh(root, "clone", "-q", "--bare", seed, origin);
  const workspace = path.join(root, "workspace");
  sh(root, "clone", "-q", origin, workspace);
  sh(workspace, "checkout", "-q", "-b", "agent/fix");
  change(workspace);
  sh(workspace, "add", "-A");
  sh(workspace, "commit", "-qm", "agent change");
  sh(workspace, "checkout", "-q", "--detach");
  return { root, workspace };
}
const fix = (d: string) => writeFileSync(path.join(d, "src/cart.ts"), readFileSync(path.join(d, "src/cart.ts"), "utf8").replace("= 50000;", "= 5000;"));
const dropTest = (d: string) => writeFileSync(path.join(d, "tests/cart.spec.ts"), readFileSync(path.join(d, "tests/cart.spec.ts"), "utf8").replace(/ {2}it\("applies 10% over 50"[\s\S]*?\n {2}\}\);\n/, ""));

describe("action inputs", () => {
  const env = { GITHUB_WORKSPACE: "/w", GITHUB_BASE_REF: "main", RUNNER_TEMP: "/t" };
  it("defaults: no task type (the strict policy defaults: a deleted test fails), fail on FAILED, external; lists by comma or newline", () => {
    expect(actionInputs(env)).toEqual({ ok: true, workspace: "/w", baseRef: "main", temp: "/t", failOn: "FAILED", args: ["--external", "--json"] });
    const r = actionInputs({ ...env, INPUT_TYPE: "bugfix", INPUT_FAIL_ON: "unknown", INPUT_LINT: "npm run lint", INPUT_TYPECHECK: "npx tsc --noEmit", INPUT_UI_PATHS: "web/**,\napp/**", INPUT_DEV: "npm run dev", INPUT_UI_ROUTES: "/\n/cart" });
    expect(r.ok && r.failOn).toBe("UNKNOWN");
    expect(r.ok && r.args).toEqual(["--external", "--json", "--type", "bugfix", "--lint", "npm run lint", "--typecheck", "npx tsc --noEmit", "--ui-paths", "web/**", "--ui-paths", "app/**", "--dev", "npm run dev", "--ui-route", "/", "--ui-route", "/cart"]);
  });
  it("not a pull request (no base ref), a bad fail-on or a bad branch name → a clear error", () => {
    expect(actionInputs({ ...env, GITHUB_BASE_REF: "" })).toMatchObject({ ok: false, error: expect.stringContaining("pull_request") });
    expect(actionInputs({ ...env, INPUT_FAIL_ON: "never" })).toMatchObject({ ok: false });
    expect(actionInputs({ ...env, GITHUB_BASE_REF: "-x" })).toMatchObject({ ok: false });
  });
});

describe("the trusted base", () => {
  it("origin/<base> of the checkout → a bare repo whose HEAD is that branch at that commit (nothing of the PR's own refs)", async () => {
    const { root, workspace } = prCheckout(fix);
    const r = await prepareBase({ workspace, baseRef: "main", temp: root });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.remote).toMatch(/^file:\/\//);
    const bare = r.remote.slice("file://".length);
    expect(sh(bare, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
    expect(sh(bare, "rev-parse", "main")).toBe(sh(workspace, "rev-parse", "origin/main"));
    expect(sh(bare, "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
    expect((await prepareBase({ workspace, baseRef: "nope", temp: root })).ok).toBe(false);
  });
});

describe("the report", () => {
  const out = (result: "VERIFIED" | "UNKNOWN" | "FAILED", reasons: string[]) => ({
    verdict: { run_id: "r_1", result, reasons, evidence: [{ detector: "D1.base_tests", status: "pass", summary: "20/20 passed" }, { detector: "D2.inventory", status: result === "FAILED" ? "fail" : "pass", summary: "inventory" }] },
    effective_level: result === "VERIFIED" ? 1 : 0, level_reasons: ["external cap"], exit: result === "VERIFIED" ? 0 : result === "UNKNOWN" ? 10 : 20,
  });
  it("summary: the verdict, each reason in words, the checks; outputs; annotations error/warning", () => {
    const f = out("FAILED", ["D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50"]);
    const s = renderSummary(f);
    expect(s).toContain("## Mandat: FAILED");
    expect(s).toContain("exists on base and is missing after the change");
    expect(s).toContain("| D2.inventory | fail | inventory |");
    expect(outputsOf(f)).toEqual(["result=FAILED", "level=0", 'reasons=["D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50"]']);
    expect(annotations(f)).toEqual(["::error title=Mandat FAILED::D2:missing_test:tests/cart.spec.ts > cart > applies 10%25 over 50"]);
    expect(annotations(out("UNKNOWN", ["D3:protected_path:.github/**"]))).toEqual(["::warning title=Mandat UNKNOWN::D3:protected_path:.github/**"]);
    expect(annotations(out("VERIFIED", []))).toEqual(["::notice title=Mandat VERIFIED::the change is verified"]);
  });
  it("the exit follows fail-on; an environment error is always red", () => {
    expect([actionExit("VERIFIED", "FAILED"), actionExit("UNKNOWN", "FAILED"), actionExit("FAILED", "FAILED")]).toEqual([0, 0, 1]);
    expect([actionExit("VERIFIED", "UNKNOWN"), actionExit("UNKNOWN", "UNKNOWN"), actionExit("FAILED", "UNKNOWN")]).toEqual([0, 1, 1]);
    expect(actionExit(null, "FAILED")).toBe(2);
  });
});

describe("runAction (simulated tests, no Docker)", () => {
  const run = async (change: (d: string) => void, extra: Record<string, string> = {}) => {
    const { root, workspace } = prCheckout(change);
    const summary = path.join(root, "summary.md");
    const output = path.join(root, "output.txt");
    writeFileSync(summary, "");
    writeFileSync(output, "");
    let log = "";
    const env = { GITHUB_WORKSPACE: workspace, GITHUB_BASE_REF: "main", RUNNER_TEMP: root, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output, MANDAT_HOME: path.join(root, "home"), ...extra };
    const code = await runAction(env, { stdout: (s) => (log += s), stderr: (s) => (log += s) }, { docker: okDocker, images: IMAGES, verify: { runTests: simRunTests(), ipv6Sysctl: true, infraUser: "1000:1000" } });
    return { code, log, summary: readFileSync(summary, "utf8"), output: readFileSync(output, "utf8") };
  };
  it("an honest fix → VERIFIED, exit 0; a deleted test → FAILED in the summary, outputs and an error annotation, exit 1", async () => {
    const ok = await run(fix, { INPUT_TYPE: "bugfix" });
    expect(ok.code).toBe(0);
    expect(ok.summary).toContain("## Mandat: VERIFIED");
    expect(ok.output).toContain("result=VERIFIED");
    const bad = await run((d) => (fix(d), dropTest(d)));
    expect(bad.code).toBe(1);
    expect(bad.summary).toContain("## Mandat: FAILED");
    expect(bad.output).toContain("result=FAILED");
    expect(bad.log).toContain("::error title=Mandat FAILED::D2:missing_test:");
  });
  it("not a pull request → exit 2 with the reason in the summary", async () => {
    const r = await run(fix, { GITHUB_BASE_REF: "" });
    expect(r.code).toBe(2);
    expect(r.summary).toContain("pull_request");
  });
});

