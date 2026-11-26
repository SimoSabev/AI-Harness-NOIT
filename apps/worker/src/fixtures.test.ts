import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES, buildFixture } from "./fixtures.js";
import { repoRoot } from "./testing.js";

// D-367: Mandat moves the mirror's main forward (a change applied by itself); the next `pnpm local` must keep it.
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };

describe("buildFixture and a mirror Mandat moved forward (D-367)", () => {
  it("main ahead of the fixture commit → advanced, nothing recreated; a foreign main → E_FIXTURE_MISMATCH", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-fx-"));
    const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
    const w = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-fx-w-")), "w");
    execFileSync("git", ["clone", "-q", fx.mirror, w], { env });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "applied"], { cwd: w, env });
    execFileSync("git", ["push", "-q", "origin", "HEAD:main"], { cwd: w, env });
    const ahead = execFileSync("git", ["--git-dir", fx.mirror, "rev-parse", "main"], { env, encoding: "utf8" }).trim();
    expect(buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" })).toEqual({ sha: fx.sha, state: "advanced", mirror: fx.mirror });
    expect(execFileSync("git", ["--git-dir", fx.mirror, "rev-parse", "main"], { env, encoding: "utf8" }).trim()).toBe(ahead);
    // a main that does not contain the fixture commit is still a mismatch
    execFileSync("git", ["checkout", "-q", "--orphan", "other"], { cwd: w, env });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "foreign"], { cwd: w, env });
    execFileSync("git", ["push", "-q", "-f", "origin", "HEAD:main"], { cwd: w, env });
    expect(() => buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" })).toThrow(/E_FIXTURE_MISMATCH|base_commit/);
  });
});

describe("E10 езици (D-688): shop-py и shop-go", () => {
  const list = (dir: string, rel = ""): string[] =>
    readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
      const r = rel ? `${rel}/${e.name}` : e.name;
      return e.isDirectory() ? (e.name === "__pycache__" ? [] : list(dir, r)) : [r];
    });
  for (const name of ["shop-py", "shop-go"] as const) {
    it(`${name}: списъкът е точно файловете на папката; mirror-ът е детерминистичен`, () => {
      const root = path.resolve(import.meta.dirname, "../../..");
      expect([...FIXTURES[name]].sort()).toEqual(list(path.join(root, "fixtures", name)).sort());
      const h1 = mkdtempSync(path.join(os.tmpdir(), "mandat-fx-"));
      const h2 = mkdtempSync(path.join(os.tmpdir(), "mandat-fx-"));
      expect(buildFixture({ repoRoot: root, mandatHome: h1, force: false, name }).sha).toBe(buildFixture({ repoRoot: root, mandatHome: h2, force: false, name }).sha);
    });
  }
});
