import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMandatYml, repoConfigFromPolicy } from "./policy.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const demo = readFileSync(path.join(repo, "fixtures/demo-shop/.mandat.yml"), "utf8");
const ok = (t: string) => {
  const r = parseMandatYml(t);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe(".mandat.yml v2 (т. 5.6)", () => {
  it("валидният пример на demo-shop → ok", () => {
    const r = ok(demo);
    expect(r.policy.task_types.bugfix).toEqual({ allowed_paths: ["src/**"], may_change_tests: false, risk_class: "low" });
    expect(r.policy.harness.required_detectors).toEqual(["D1", "D2", "D3", "D4", "D10"]);
    expect(r.config_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it("непознат ключ → грешка (strict навсякъде)", () => {
    expect(parseMandatYml(`${demo}\nextra: 1\n`)).toEqual({ ok: false, error: expect.stringContaining("policy:") });
    expect(parseMandatYml(demo.replace("  max_level: 3", "  max_level: 3\n  bypass: true")).ok).toBe(false);
  });
  it("!!js тагове, custom тагове, merge keys и aliases → грешка", () => {
    expect(parseMandatYml(demo.replace("version: 2", "version: !!js/function 'function(){}'")).ok).toBe(false);
    expect(parseMandatYml(demo.replace("version: 2", "version: !custom 2")).ok).toBe(false);
    expect(parseMandatYml("a: &x {b: 1}\nc:\n  <<: *x\n").ok).toBe(false);
    expect(parseMandatYml("a: &x [1]\nb: *x\n").ok).toBe(false);
    expect(parseMandatYml("a: 1\na: 2\n").ok).toBe(false);
    expect(parseMandatYml("a: [1").ok).toBe(false);
    expect(parseMandatYml("x".repeat(300 * 1024)).ok).toBe(false);
  });
  it("хешът е стабилен при разбъркани ключове", () => {
    const shuffled = demo.replace("version: 2\n", "").replace("security:\n  max_file_mb: 5\n  max_diff_mb: 20\n  max_files: 500\n", "") +
      "security:\n  max_files: 500\n  max_diff_mb: 20\n  max_file_mb: 5\nversion: 2\n";
    expect(ok(shuffled).config_hash).toBe(ok(demo).config_hash);
    expect(ok(demo.replace("task_usd: 2", "task_usd: 3")).config_hash).not.toBe(ok(demo).config_hash);
  });
  it("семантични проверки: default ∈ allowed, risk_class съществува", () => {
    expect(parseMandatYml(demo.replace("  default: claude", "  default: codex").replace("allowed: [claude, codex]", "allowed: [claude]")).ok).toBe(false);
    expect(parseMandatYml(demo.replace("    risk_class: medium", "    risk_class: high").replace("  high:\n    level_cap: 1\n    requires_second_factor: true\n", "")).ok).toBe(false);
  });
});

describe("repoConfigFromPolicy (F18, unsupported-runner)", () => {
  it("npm + vitest → RepoConfig на E0", () => {
    const r = repoConfigFromPolicy(ok(demo).policy);
    expect(r.ok && r.config.runtime).toEqual({ install: "npm ci --ignore-scripts", node: "24" });
    expect(r.ok && r.config.tests.format).toBe("vitest-json");
  });
  it("jest / pnpm → unsupported_runner", () => {
    const jest = ok(demo.replace("framework: vitest", "framework: jest"));
    expect(repoConfigFromPolicy(jest.policy)).toEqual({ ok: false, reason: "unsupported_runner", detail: "npm/jest" });
    const pnpm = ok(demo.replace("package_manager: npm", "package_manager: pnpm").replace("install: npm ci --ignore-scripts", "install: pnpm install --frozen-lockfile"));
    expect(repoConfigFromPolicy(pnpm.policy)).toEqual({ ok: false, reason: "unsupported_runner", detail: "pnpm/vitest" });
  });
});
