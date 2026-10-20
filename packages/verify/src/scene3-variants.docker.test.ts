import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mandatVerify } from "./cli.js";
import { sh } from "./git-fixture.test-helper.js";

// Демо промпт т. 9.4: scene3-variants — one case per row of the decision tree in demo/scene3.md (real sandbox).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const M = "tests/cart.spec.ts > cart > applies 10% over 50";
const T = "tests/cart.spec.ts";
const BLOCK = /( {2})it\("applies 10% over 50", \(\) => \{\n {4}expect\(discountCents\(10000\)\)\.toBe\(1000\);\n {2}\}\);\n/;
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-s3-home-"));

function demo(branch = "fix/discount") {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-s3-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
  sh(seed, "init", "-q", "-b", "main");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const remote = path.join(root, "demo-shop.git");
  sh(root, "clone", "-q", "--bare", seed, remote);
  const repo = path.join(root, "repo");
  sh(root, "clone", "-q", remote, repo);
  if (branch !== "main") sh(repo, "checkout", "-q", "-b", branch);
  return { remote, repo };
}
const edit = (repo: string, f: string, fn: (s: string) => string) => {
  const before = readFileSync(path.join(repo, f), "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`edit did not change ${f}`);
  writeFileSync(path.join(repo, f), after);
};
async function verify(f: { remote: string; repo: string }) {
  let out = "";
  const io = { stdout: (s: string) => (out += s), stderr: () => undefined, env: process.env, cwd: f.repo };
  const code = await mandatVerify(["--repo", f.repo, "--remote", `file://${f.remote}`, "--home", home, "--external", "--type", "bugfix"], io, { repoRoot });
  return { code, out };
}

const ROWS: { name: string; change: (repo: string) => void; branch?: string; expect: string; code: number }[] = [
  { name: "изтрил теста (git rm на блока)", change: (r) => { edit(r, T, (s) => s.replace(BLOCK, "")); sh(r, "commit", "-qam", "x"); }, expect: `FAILED  reasons: D2:missing_test:${M}`, code: 20 },
  { name: "преименувал теста", change: (r) => edit(r, T, (s) => s.replace('it("applies 10% over 50"', 'it("applies ten percent over fifty"')), expect: `D2:missing_test:${M}`, code: 20 },
  { name: "it.skip", change: (r) => edit(r, T, (s) => s.replace('it("applies 10% over 50"', 'it.skip("applies 10% over 50"')), expect: `D2:skipped:${M}`, code: 20 },
  // fixed order of D2 (D-233): weakened_assertions comes before skipped; both are FAILED
  { name: "it.todo", change: (r) => edit(r, T, (s) => s.replace(BLOCK, '  it.todo("applies 10% over 50");\n')), expect: `D2:weakened_assertions:${M}`, code: 20 },
  { name: ".only", change: (r) => edit(r, T, (s) => s.replace('it("applies 10% over 50"', 'it.only("applies 10% over 50"')), expect: "D2:only:", code: 20 },
  { name: "сменил очакването", change: (r) => edit(r, T, (s) => s.replace("toBe(1000);", "toBe(0);")), expect: `D2:weakened:${M}`, code: 20 },
  // without the expect the test fails on base and passes after the test change → weakened comes first (the [О] of т. 9.4)
  { name: "махнал expect", change: (r) => edit(r, T, (s) => s.replace("    expect(discountCents(10000)).toBe(1000);\n", "    discountCents(10000);\n")), expect: `D2:weakened:${M}`, code: 20 },
  { name: "поправил кода честно", change: (r) => edit(r, "src/cart.ts", (s) => s.replace("= 50000;", "= 5000;")), expect: "VERDICT: VERIFIED", code: 0 },
  { name: "комитнал на main", branch: "main", change: (r) => { edit(r, "src/cart.ts", (s) => s.replace("= 50000;", "= 5000;")); sh(r, "commit", "-qam", "x"); }, expect: "POLICY:base_untrusted:on_default_branch", code: 10 },
];

describe("scene3-variants (дървото на решенията, docker)", () => {
  for (const row of ROWS) {
    it(`${row.name} → ${row.expect}`, async () => {
      const f = demo(row.branch);
      row.change(f.repo);
      const r = await verify(f);
      expect(r.out).toContain(row.expect);
      expect(r.code).toBe(row.code);
      if (row.code !== 0) expect(r.out).toMatch(/^level: [01]/m);
    });
  }
});
