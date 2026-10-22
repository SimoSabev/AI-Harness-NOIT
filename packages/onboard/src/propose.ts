import { parseMandatYml, repoConfigFromPolicy, sha256Tag } from "@mandat/contract";
import type { MandatPolicy } from "@mandat/contract";
import { stringify } from "yaml";
import { classifyCommand } from "./commands.js";
import { riskProfile } from "./risk-profile.js";
import type { ScanResult } from "./scan.js";

// Демо промпт т. 8.2 (6): the `.mandat.yml` proposal + field_sources. The source is NOT in the YAML (clean for zod);
// `annotate()` adds `# source: …` comments for the committed file and for `mandat init`.
export type Source = "lockfile" | `package.json#scripts.${string}` | "ci.yml" | "baseline" | "human" | `rule:${string}`;
/** E7г / D-314: two runs on base at connect; `flaky` = IDs whose status differed between them */
export interface Baseline { status: "ok" | "failed" | "error"; test_ids_count: number; skipped: number; duration_s: number; report_valid: boolean; flaky?: string[] }
export interface SuggestedTask { type: "bugfix" | "feature" | "docs"; title: string; text: string }
export interface Proposal {
  policy: MandatPolicy;
  yaml: string;
  sha256: string;
  field_sources: Record<string, Source>;
  risk_cap: 1 | 3;
  risk_reasons: string[];
  needs_human: string[];
  /** invisible characters in existing instruction files: the approval is blocked */
  blocked: string[];
  warnings: string[];
  /** E7г: a first task the human may start (e.g. 0 tests → "add tests") */
  suggested_tasks: SuggestedTask[];
}

const INSTALL: Record<string, string> = { npm: "npm ci --ignore-scripts", pnpm: "pnpm install --frozen-lockfile --ignore-scripts", yarn: "yarn install --frozen-lockfile --ignore-scripts" };
const TEST_CMD: Record<string, string> = {
  vitest: "npx vitest run --reporter=json --outputFile=$MANDAT_REPORT",
  jest: "npx jest --json --outputFile=$MANDAT_REPORT",
  mocha: "npx mocha --reporter json",
  node: "node --test",
};
const PROTECTED_BASE = [".github/**", ".mandat.yml", ".claude/**", ".mcp.json", ".codex/**", "AGENTS.md", "CLAUDE.md", ".npmrc", "**/__snapshots__/**"];
const CONFIG_PATHS = [".mandat.yml", ".claude/**", ".codex/**", ".npmrc", "AGENTS.md", "CLAUDE.md"];

export function propose(scan: ScanResult, o: { baseline?: Baseline | null; rulesStrict?: boolean | null } = {}): Proposal {
  const src: Record<string, Source> = {};
  const needs: string[] = [];
  const riskReasons: string[] = [];
  const warnings: string[] = [];
  const pm = scan.packageManager === "pnpm" || scan.packageManager === "yarn" ? scan.packageManager : "npm";
  if (!scan.packageManager) needs.push("runtime.package_manager: no lockfile");
  if (scan.packageManager === "bun") needs.push("runtime.package_manager: bun is not supported");
  src["runtime.package_manager"] = scan.packageManager ? "lockfile" : "human";
  src["runtime.install"] = scan.packageManager ? "lockfile" : "human";
  src["runtime.node"] = "human"; // .nvmrc / engines / default: a human confirms the runtime
  const framework = scan.framework ?? "vitest";
  if (!scan.framework) needs.push("tests.framework: not detected");
  const fwSource: Source = o.baseline?.report_valid ? "baseline" : scan.frameworkSource === "package.json#scripts.test" ? "package.json#scripts.test" : scan.frameworkSource === "lockfile" ? "lockfile" : "human";
  src["tests.framework"] = fwSource;
  src["tests.command"] = scan.scripts.test ? "package.json#scripts.test" : "human";
  src["tests.test_globs"] = scan.scripts.test ? "package.json#scripts.test" : "human";
  const testCmd = TEST_CMD[framework] as string;
  if (scan.scripts.test && classifyCommand(scan.scripts.test) === "forbidden") needs.push("package.json#scripts.test: forbidden syntax (|, ;, &&, $(, >, curl, wget, sh -c)");
  if (classifyCommand(testCmd) !== "allowed") needs.push("tests.command: not on the allowlist");
  const globs = [...new Set([...scan.testDirs.map((d) => `${d}/**`), "**/*.spec.ts", "**/*.test.ts", "**/*.spec.js", "**/*.test.js"])];
  // CI
  const wf = scan.workflows.find((w) => w.testJobs.length > 0) ?? scan.workflows[0] ?? null;
  if (wf) {
    src["ci.workflow"] = "ci.yml";
    src["ci.required_checks"] = "ci.yml";
    if (wf.light === "red") riskReasons.push(`ci: ${wf.path} has write permissions`);
    if (wf.light === "yellow") warnings.push(`ci: ${wf.path} has no permissions block (default token rights)`);
  }
  if (o.rulesStrict === false) warnings.push("ruleset: main does not require up-to-date branches (strict=false)");
  // baseline (Ф5 step 4)
  const suggested: SuggestedTask[] = [];
  if (o.baseline) {
    if (o.baseline.flaky?.length) {
      src["tests.flaky"] = "baseline";
      warnings.push(`baseline: ${o.baseline.flaky.length} flaky test(s); D1 does not count them`);
    }
    if (o.baseline.test_ids_count === 0) {
      riskReasons.push("baseline: 0 tests");
      suggested.push({ type: "feature", title: "Add tests for the main module", text: "The project has no tests. Add a test file that covers the main behaviour of the most used module; do not change the code under test." });
    }
    if (o.baseline.status !== "ok") warnings.push(`baseline: ${o.baseline.status}`);
  }
  const blocked = scan.instructions.filter((f) => f.invisible.length > 0).map((f) => `${f.path}: ${f.invisible.length} invisible character(s) (${[...new Set(f.invisible.map((h) => h.codepoint))].slice(0, 3).join(", ")})`);
  for (const f of scan.instructions.filter((x) => x.patterns.length > 0)) warnings.push(`${f.path}: ${f.patterns.join(", ")}`);
  const riskCap: 1 | 3 = riskReasons.length > 0 ? 1 : 3;
  const cap = (n: number) => Math.min(n, riskCap);
  const src0 = scan.srcDirs.length > 0 ? scan.srcDirs.map((d) => `${d}/**`) : ["**"];
  // E7г risk profile v1 (folder rules): high → protected (a human relaxes it); code → medium; docs → low
  const risk = riskProfile(scan);
  for (const h of risk.high) src[`protected_paths.${h.glob}`] = h.rule;
  const bugRisk = risk.medium.length > 0 ? "medium" : "low";
  src["task_types.bugfix.risk_class"] = risk.medium.length > 0 ? "rule:src" : "human";
  src["task_types.docs.risk_class"] = "rule:docs";
  const taskTypes: MandatPolicy["task_types"] = {
    bugfix: { allowed_paths: src0, may_change_tests: false, risk_class: bugRisk },
    feature: { allowed_paths: [...src0, ...scan.testDirs.map((d) => `${d}/**`)].filter((x, i, a) => a.indexOf(x) === i), may_change_tests: true, risk_class: "medium" },
    docs: { allowed_paths: ["README.md", "docs/**"], may_change_tests: false, risk_class: "low" },
  };
  if (scan.hasCss) taskTypes.css = { allowed_paths: ["**/*.css", "**/*.scss"], may_change_tests: false, risk_class: "low" };
  src["task_types"] = "human";
  src["risk_classes"] = riskReasons.length > 0 ? (riskReasons.some((r) => r.startsWith("baseline")) ? "baseline" : "ci.yml") : "human";
  const raw = {
    version: 2,
    runtime: { node: scan.node, package_manager: pm, install: INSTALL[pm] as string },
    tests: { framework, command: testCmd, env: { CI: "true" }, test_globs: globs, ...(o.baseline?.flaky?.length ? { flaky: [...o.baseline.flaky].sort() } : {}) },
    ci: wf ? { provider: "github_actions", workflow: wf.path, required_checks: wf.testJobs } : null,
    task_types: taskTypes,
    risk_classes: { low: { level_cap: cap(3) }, medium: { level_cap: cap(2) }, high: { level_cap: 1, requires_second_factor: true } },
    protected_paths: [...new Set([...PROTECTED_BASE, ...scan.configFiles.filter((f) => f !== ".npmrc"), ...risk.high.map((h) => h.glob)])],
    protected_json_fields: { "package.json": ["scripts", "overrides", "workspaces", "imports"] },
    config_paths: CONFIG_PATHS,
    budgets: { task_usd: 2, task_minutes: 30 },
    models: { allowed: ["claude", "codex"], default: "claude" },
    harness: { required_detectors: ["D1", "D2", "D3", "D4", "D10"], max_level: riskCap },
    security: { max_file_mb: 5, max_diff_mb: 20, max_files: 500 },
  };
  const yaml = `# Mandat policy v2, proposed by \`mandat init\` (no AI). Review every field; nothing is approved automatically.\n${stringify(raw, { lineWidth: 0 })}`;
  const parsed = parseMandatYml(yaml);
  if (!parsed.ok) throw new Error(`proposal does not validate: ${parsed.error}`);
  const rc = repoConfigFromPolicy(parsed.policy);
  if (!rc.ok) needs.push(`runner ${rc.detail}: the sandbox runs npm, pnpm (lockfile v9) or yarn v1 with vitest or jest on node 24 (D-301)`);
  if (scan.monorepo.tool) needs.push(`monorepo (${scan.monorepo.tool}): the sandbox installs one package, workspaces are not supported yet (D-301)`);
  return { policy: parsed.policy, yaml, sha256: sha256Tag(yaml), field_sources: src, risk_cap: riskCap, risk_reasons: riskReasons, needs_human: needs, blocked, warnings, suggested_tasks: suggested };
}

/** `# source: …` comments on the keys that have a source (the YAML stays valid; comments are ignored by zod). */
export function annotate(yaml: string, sources: Record<string, Source>): string {
  const stack: { indent: number; key: string }[] = [];
  return yaml
    .split("\n")
    .map((line) => {
      const m = /^(\s*)([A-Za-z_][A-Za-z0-9_.]*):(.*)$/.exec(line);
      if (!m) return line;
      const indent = (m[1] ?? "").length;
      while (stack.length > 0 && (stack[stack.length - 1] as { indent: number }).indent >= indent) stack.pop();
      stack.push({ indent, key: m[2] as string });
      const p = stack.map((s) => s.key).join(".");
      const s = sources[p];
      return s ? `${line}  # source: ${s}` : line;
    })
    .join("\n");
}
