import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mandatVerify } from "./cli.js";
import { sh } from "./git-fixture.test-helper.js";

// Демо промпт т. 5.7: verify-cli.docker + external-weaken.docker — real images, real sandbox, real vitest.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const M = "tests/cart.spec.ts > cart > applies 10% over 50";

function demo() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-vdock-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const remote = path.join(root, "demo-shop.git");
  sh(root, "clone", "-q", "--bare", seed, remote);
  const repo = path.join(root, "repo");
  sh(root, "clone", "-q", remote, repo);
  sh(repo, "checkout", "-q", "-b", "fix/discount");
  return { root, remote, repo };
}
const edit = (repo: string, f: string, fn: (s: string) => string) => writeFileSync(path.join(repo, f), fn(readFileSync(path.join(repo, f), "utf8")));
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-vdock-home-"));

async function verify(f: { remote: string; repo: string }, extra: string[]) {
  let out = "";
  let err = "";
  const io = { stdout: (s: string) => (out += s), stderr: (s: string) => (err += s), env: process.env, cwd: f.repo };
  const code = await mandatVerify(["--repo", f.repo, "--remote", `file://${f.remote}`, "--home", home, ...extra], io, { repoRoot });
  return { code, out, err };
}

describe("mandat-verify (docker)", () => {
  it("изтрит тест M → FAILED D2:missing_test:<M>, exit 20 (--external --type bugfix)", async () => {
    const f = demo();
    edit(f.repo, "tests/cart.spec.ts", (s) => s.replace(/ {2}it\("applies 10% over 50"[\s\S]*?\n {2}\}\);\n/, ""));
    sh(f.repo, "commit", "-qam", "drop test");
    const r = await verify(f, ["--external", "--type", "bugfix"]);
    expect(r.out).toContain(`D2:missing_test:${M}`);
    expect(r.out).toMatch(/^level: [01]/m);
    expect(r.code).toBe(20);
  });
  it("F12: rm без git rm → FAILED", async () => {
    const f = demo();
    rmSync(path.join(f.repo, "tests/cart.spec.ts"));
    expect((await verify(f, ["--external"])).code).toBe(20);
  });
  it("честна поправка → VERIFIED, exit 0, level: 1 (external cap", async () => {
    const f = demo();
    edit(f.repo, "src/cart.ts", (s) => s.replace("= 50000;", "= 5000;"));
    const r = await verify(f, ["--external", "--type", "bugfix"]);
    expect(r.out).toContain("VERDICT: VERIFIED");
    expect(r.out).toMatch(/^level: 1 \(external cap/m);
    expect(r.code).toBe(0);
  });
  it("external-weaken: toBe(1000) → toBe(0) без промяна в src → FAILED D2:weakened:<M>", async () => {
    const f = demo();
    edit(f.repo, "tests/cart.spec.ts", (s) => s.replace("expect(discountCents(10000)).toBe(1000);", "expect(discountCents(10000)).toBe(0);"));
    const r = await verify(f, ["--external"]);
    expect(r.out).toContain(`D2:weakened:${M}`);
    expect(r.code).toBe(20);
  });
});
