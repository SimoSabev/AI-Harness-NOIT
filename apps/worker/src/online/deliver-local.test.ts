import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { deliverLocal } from "./deliver-local.js";

// E8g (v5 p. 4.7 (5), AC-9.3, D-356): a project without GitHub — the verified change becomes a branch mandat/<task>-a<n> in
// Mandat's own mirror (one commit with the template message); a branch that exists is never overwritten.
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
function agentPatch(mirror: string): Buffer {
  const w = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-agent-")), "w");
  execFileSync("git", ["clone", "-q", mirror, w], { env });
  execFileSync("git", ["apply"], { cwd: w, env, input: readFileSync(path.join(repoRoot, "demo/recordings/scene1-task1.patch")) });
  return execFileSync("git", ["diff", "--binary"], { cwd: w, env });
}

describe("deliverLocal (AC-9.3)", () => {
  it("a branch in the mirror with one commit on the base; an existing branch → refused", async () => {
    const fx = buildFixture({ repoRoot, mandatHome: mkdtempSync(path.join(os.tmpdir(), "mandat-dl-")), force: false, name: "demo-shop" });
    const r = await deliverLocal({ mirror: fx.mirror, taskId: "t_x", attempt: 1, baseSha: fx.sha, patch: agentPatch(fx.mirror), message: "fix: the discount\n\nMandat-Task: t_x" });
    expect(r).toMatchObject({ ok: true, ref: "mandat/t_x-a1" });
    const git = (...a: string[]) => execFileSync("git", ["--git-dir", fx.mirror, ...a], { env, encoding: "utf8" }).trim();
    expect(git("rev-parse", "mandat/t_x-a1^")).toBe(fx.sha);
    expect(git("log", "-1", "--format=%B", "mandat/t_x-a1")).toContain("Mandat-Task: t_x");
    expect(git("show", "mandat/t_x-a1:src/cart.ts")).toContain("const DISCOUNT_THRESHOLD_CENTS = 5000;");
    expect(await deliverLocal({ mirror: fx.mirror, taskId: "t_x", attempt: 1, baseSha: fx.sha, patch: agentPatch(fx.mirror), message: "x" })).toEqual({ ok: false, reason: "branch_exists" });
  });
});
