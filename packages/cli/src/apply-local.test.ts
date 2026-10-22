import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixture, deliverLocal } from "@mandat/worker";
import { applyLocal } from "./commands/apply.js";
import { repoRoot } from "./paths.js";

// E8g (v5 p. 4.7 (5), AC-9.3, D-356, T3-7): `mandat apply --task <id>` merges Mandat's branch into the person's working copy
// with --ff-only. Never reset, never checkout -f; on anything else it refuses with the reason and git status stays as it was.
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
const g = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env, encoding: "utf8" });
async function setup() {
  const fx = buildFixture({ repoRoot, mandatHome: mkdtempSync(path.join(os.tmpdir(), "mandat-ap-")), force: false, name: "demo-shop" });
  const human = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-human-")), "shop");
  g(os.tmpdir(), "clone", "-q", fx.mirror, human);
  const w = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-agent-")), "w");
  g(os.tmpdir(), "clone", "-q", fx.mirror, w);
  execFileSync("git", ["apply"], { cwd: w, env, input: readFileSync(path.join(repoRoot, "demo/recordings/scene1-task1.patch")) });
  const patch = execFileSync("git", ["diff", "--binary"], { cwd: w, env });
  await deliverLocal({ mirror: fx.mirror, taskId: "t_ap", attempt: 2, baseSha: fx.sha, patch, message: "fix: discount\n\nMandat-Task: t_ap" });
  return { fx, human };
}

describe("mandat apply (AC-9.3)", () => {
  it("ff-only: the change lands, an untracked file of the person stays untouched", async () => {
    const { fx, human } = await setup();
    writeFileSync(path.join(human, "notes.local"), "mine\n");
    const r = await applyLocal({ mirror: fx.mirror, repo: human, taskId: "t_ap" });
    expect(r).toMatchObject({ ok: true, ref: "mandat/t_ap-a2" });
    expect(readFileSync(path.join(human, "src/cart.ts"), "utf8")).toContain("const DISCOUNT_THRESHOLD_CENTS = 5000;");
    expect(g(human, "status", "--porcelain")).toBe("?? notes.local\n");
  });
  it("a local change to a file the branch touches → refused (local_changes); status unchanged", async () => {
    const { fx, human } = await setup();
    writeFileSync(path.join(human, "src/cart.ts"), readFileSync(path.join(human, "src/cart.ts"), "utf8") + "// mine\n");
    const before = g(human, "status", "--porcelain");
    expect(await applyLocal({ mirror: fx.mirror, repo: human, taskId: "t_ap" })).toMatchObject({ ok: false, reason: "local_changes" });
    expect(g(human, "status", "--porcelain")).toBe(before);
  });
  it("the person's branch moved on (not an ancestor) → refused (diverged); nothing changes", async () => {
    const { fx, human } = await setup();
    writeFileSync(path.join(human, "README.md"), "changed\n");
    g(human, "commit", "-qam", "mine");
    const head = g(human, "rev-parse", "HEAD");
    expect(await applyLocal({ mirror: fx.mirror, repo: human, taskId: "t_ap" })).toMatchObject({ ok: false, reason: "diverged" });
    expect(g(human, "rev-parse", "HEAD")).toBe(head);
  });
  it("no branch for the task → refused (no_branch)", async () => {
    const { fx, human } = await setup();
    expect(await applyLocal({ mirror: fx.mirror, repo: human, taskId: "t_none" })).toMatchObject({ ok: false, reason: "no_branch" });
  });
});
