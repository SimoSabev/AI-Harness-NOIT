import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMandatYml, repoConfigFromPolicy } from "@mandat/contract";
import { classifyRedOnBase } from "@mandat/core";
import type { Spec } from "@mandat/contract";
import { readFileSync } from "node:fs";
import { sh } from "./git-fixture.test-helper.js";
import { runOracleOnBase } from "./oracle-base.js";
import { M_TITLE, okDocker, simRunTests } from "./shop-sim.test-helper.js";
import type { OracleBaseInput } from "./oracle-base.js";
import type { TestProcedureInput } from "./test-procedure.js";

// D-534 (М1 Х3): the oracle's tests run on the current base in a run of their own (simulated runner, no Docker).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function mirror(): { remote: string; base: string; root: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-oracle-base-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const remote = path.join(root, "demo-shop.git");
  sh(root, "clone", "-q", "--bare", seed, remote);
  return { remote, base: sh(seed, "rev-parse", "HEAD"), root };
}
const yml = parseMandatYml(readFileSync(path.join(repoRoot, "fixtures/demo-shop/.mandat.yml"), "utf8"));
if (!yml.ok) throw new Error(yml.error);
const rc = repoConfigFromPolicy(yml.policy);
if (!rc.ok) throw new Error(rc.detail);
// the simulator judges the test titled M_TITLE, so the tag sits on the describe block
const test = (group: string, title: string, expect1000: boolean) =>
  Buffer.from(`import { describe, expect, it } from "vitest";\nimport { discountCents } from "../../src/cart";\ndescribe("${group}", () => {\n  it("${title}", () => {\n    expect(discountCents(10000)).toBe(${expect1000 ? 1000 : 0});\n  });\n});\n`);
const spec: Spec = { goal: "Discount over 50", product: "", criteria: [{ id: "AC-1", when: "the subtotal is over 50", shall: "apply 10%", proof: "tests" }], unchanged: ["no discount under 50"], out_of_scope: [], profile: "feature" };

const input = (m: { remote: string; base: string; root: string }): Omit<OracleBaseInput, "runId" | "tests"> => ({
  docker: okDocker, runDir: path.join(m.root, "run"), mandatHome: m.root, home: m.root, images: { sandbox: "s", gate: "g", proxy: "p" },
  infraUser: "1000:1000", ipv6Sysctl: true, mirrorPath: m.remote, baseSha: m.base, rc: rc.config, tmpRoot: m.root,
});

describe("the oracle on the base (D-534)", () => {
  it("writes the tests at their repo-root paths (any __hidden__ depth) in a clean base clone, runs them as tree B of its own run, returns only them", async () => {
    const m = mirror();
    const seen: TestProcedureInput[] = [];
    const sim = simRunTests();
    const r = await runOracleOnBase({
      docker: okDocker, runId: "r_oracle1", runDir: path.join(m.root, "run"), mandatHome: path.join(m.root, "home"), home: path.join(m.root, "home"), images: { sandbox: "s", gate: "g", proxy: "p" },
      infraUser: "1000:1000", ipv6Sysctl: true, mirrorPath: m.remote, baseSha: m.base, rc: rc.config, tmpRoot: m.root,
      tests: { dir: "", files: [{ path: "tests/__hidden__/a.spec.ts", data: test("AC-1: over 50", M_TITLE, true) }, { path: "src/deep/__hidden__/b.spec.ts", data: test("oracle", "U-1: under 50 there is none", false) }] },
      runTests: (i) => {
        seen.push(i);
        return sim(i);
      },
    });
    expect(seen.map((i) => [i.tree, i.runId])).toEqual([["b", "r_oracle1"]]);
    if (!r.ok) throw new Error(r.code);
    // the base is buggy: the criterion test is red, the unchanged one green; the repo's own tests are not in the result
    expect(r.results).toEqual([
      { id: `src/deep/__hidden__/b.spec.ts > oracle > U-1: under 50 there is none`, status: "passed" },
      { id: `tests/__hidden__/a.spec.ts > AC-1: over 50 > ${M_TITLE}`, status: "failed" },
    ]);
    expect(classifyRedOnBase({ spec, results: r.results })).toMatchObject({ ready: true, red_on_base: [{ criterion_id: "AC-1", red: true }] });
    // the clean clone is gone and the mirror has only its base commit
    expect(readdirSync(m.root).filter((n) => n.startsWith("oracle-base"))).toEqual([]);
    expect(sh(m.root, "--git-dir", m.remote, "rev-list", "--all", "--count")).toBe("1");
  });
  it("D-536: the runner picked up none of the files (e.g. outside a vitest workspace) → zero results → not_discovered", async () => {
    const m = mirror();
    // the project's runner only discovers src/**: the root tests/__hidden__ files are never in its report
    const sim = simRunTests((_i, raw) => {
      const j = JSON.parse(raw) as { testResults: { name: string }[] };
      return JSON.stringify({ ...j, testResults: j.testResults.filter((t) => !t.name.includes("/__hidden__/")) });
    });
    const r = await runOracleOnBase({ ...input(m), runId: "r_oracle3", tests: { dir: "", files: [{ path: "tests/__hidden__/a.spec.ts", data: test("AC-1: over 50", M_TITLE, true) }] }, runTests: sim });
    if (!r.ok) throw new Error(r.code);
    expect(r.results).toEqual([]);
    expect(classifyRedOnBase({ spec, results: r.results }).problems).toEqual([{ kind: "not_discovered", id: "-" }]);
  });
  it("a broken report is its own failure, not 'nothing discovered'", async () => {
    const m = mirror();
    const r = await runOracleOnBase({ ...input(m), runId: "r_oracle4", tests: { dir: "", files: [{ path: "tests/__hidden__/a.spec.ts", data: test("AC-1: over 50", M_TITLE, true) }] }, runTests: simRunTests(() => "{") });
    expect(r).toEqual({ ok: false, code: "E_ORACLE_REPORT" });
  });
  it("a path that leaves the oracle directory is refused before anything runs", async () => {
    const m = mirror();
    let ran = false;
    const r = await runOracleOnBase({
      docker: okDocker, runId: "r_oracle2", runDir: path.join(m.root, "run"), mandatHome: m.root, home: m.root, images: { sandbox: "s", gate: "g", proxy: "p" },
      infraUser: "1000:1000", ipv6Sysctl: true, mirrorPath: m.remote, baseSha: m.base, rc: rc.config, tmpRoot: m.root,
      tests: { dir: "", files: [{ path: "tests/__hidden__/../../src/cart.ts", data: Buffer.from("x") }] },
      runTests: () => {
        ran = true;
        return Promise.resolve({ ok: false, code: "E_INSTALL_TREE" });
      },
    });
    expect(r).toEqual({ ok: false, code: "E_ORACLE_PATH" });
    expect(ran).toBe(false);
  });
});
