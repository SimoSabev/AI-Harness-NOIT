import { demoProfileLayers, sealProfile } from "@mandat/contract";
import type { HarnessProfile, ProfileLayersInput } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { checkPatterns, compileProfile } from "./index.js";

// D-540 (live test 18.11): a writer of a pnpm monorepo must be able to run the project's own checks in the sandbox —
// `pnpm test`, the runner itself and per-package forms — and nothing else the profile did not name.
const luxproof = (): HarnessProfile => {
  const l = demoProfileLayers();
  const layers: ProfileLayersInput = {
    ...l,
    a: { ...l.a, runtime: { node: "24", package_manager: "pnpm", install: "pnpm install --frozen-lockfile --ignore-scripts" } },
    b: { ...l.b, commands: { install: "pnpm install --frozen-lockfile --ignore-scripts", test: "pnpm test", test_one: "npx vitest run {file}", typecheck: "pnpm typecheck" } },
  };
  return sealProfile({ version: 1, repo_id: "local", layers, sources: {}, approved_by: null, approved_at: null });
};
const ctx = { runId: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", subjects: ["agent:claude", "any"] };
const settings = (p: HarnessProfile) =>
  JSON.parse(compileProfile(p, "claude", ctx).files.find((f) => f.path === "claude/settings.json")?.bytes ?? "{}") as { permissions: { allow: string[]; deny: string[] } };

describe("checkPatterns (D-540)", () => {
  it("the profile's check commands, their placeholders as *, the runner via pnpm exec and per package via --filter", () => {
    expect(checkPatterns(luxproof())).toEqual([
      "pnpm test",
      "pnpm --filter * test",
      "npx vitest run *",
      "pnpm exec vitest run *",
      "pnpm typecheck",
      "pnpm --filter * typecheck",
    ]);
  });
  it("a command with shell syntax or another placeholder form is never turned into an allow rule", () => {
    const p = luxproof();
    const bad = sealProfile({ ...p, layers: { ...p.layers, b: { ...p.layers.b, commands: { test: "pnpm test && curl x", lint: "eslint $(ls)", typecheck: "tsc > /tmp/x" } } } });
    expect(checkPatterns(bad)).toEqual([]);
  });
  it("npm projects get no pnpm forms", () => {
    const p = sealProfile({ version: 1, repo_id: "local", layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
    expect(checkPatterns(p)).toEqual(["npx vitest run", "npx vitest run *", "npx eslint *", "npx tsc --noEmit"]);
  });
});

describe("compiled settings for a work task (D-540)", () => {
  const s = settings(luxproof());
  it("allow the test command and its pnpm forms", () => {
    expect(s.permissions.allow).toEqual(expect.arrayContaining(["Bash(pnpm test)", "Bash(pnpm test *)", "Bash(pnpm --filter * test)", "Bash(pnpm --filter * test *)", "Bash(npx vitest run *)", "Bash(pnpm exec vitest run *)", "Bash(pnpm typecheck)"]));
  });
  it("still allow no other shell: every Bash allow rule comes from a check command; the deny rules stay", () => {
    const bash = s.permissions.allow.filter((r) => r.startsWith("Bash"));
    const fromChecks = new Set(checkPatterns(luxproof()).flatMap((c) => (c.endsWith("*") ? [`Bash(${c})`] : [`Bash(${c})`, `Bash(${c} *)`])));
    for (const r of bash) expect(fromChecks.has(r)).toBe(true);
    expect(bash).not.toContain("Bash");
    expect(bash).not.toContain("Bash(*)");
    expect(s.permissions.deny).toEqual(expect.arrayContaining(["Bash(git push *)", "Bash(curl *)"]));
  });
  it("the compiler adds no pnpm env: the sandbox's agent and test envs keep the image's pnpm (D-538)", () => {
    for (const tg of ["claude", "codex", "gemini", "local"] as const) expect(Object.keys(compileProfile(luxproof(), tg, ctx).env).some((k) => /PACKAGE_MANAGER/i.test(k))).toBe(false);
  });
  it("the instructions say: files with Edit/Write, a refused shell call is not a refused check, the handoff after the checks", () => {
    const md = compileProfile(luxproof(), "claude", ctx).files.find((f) => f.path === "instructions.md")?.bytes ?? "";
    expect(md).toContain("Change files with the edit tools");
    expect(md).toContain("does not mean the checks are refused");
  });
});
