import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixture } from "./fixtures.js";
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
