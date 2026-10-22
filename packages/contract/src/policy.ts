import { parseDocument } from "yaml";
import { z } from "zod";
import { hashJcs } from "./hash.js";
import { Glob, RepoConfig, TaskType, TestId } from "./schemas.js";
import type { Sha256 } from "./schemas.js";

// `.mandat.yml` v2 minimum (демо промпт т. 5.6; D-265: block contents are the coder's minimum until docs/spec arrives).
const EnvName = z.string().regex(/^[A-Z_][A-Z0-9_]*$/);
export const RiskClass = z.enum(["low", "medium", "high"]);
export type RiskClass = z.infer<typeof RiskClass>;
// Detectors a policy may require. D5/D6/D8 do not exist in this prompt → FAILED INFRA:detector_missing (т. 3.4).
export const PolicyDetector = z.enum(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D10"]);
export type PolicyDetector = z.infer<typeof PolicyDetector>;

export const MandatPolicy = z
  .object({
    version: z.literal(2),
    runtime: z
      .object({
        node: z.enum(["20", "22", "24"]),
        package_manager: z.enum(["npm", "pnpm", "yarn"]),
        install: z.string().min(1).max(200),
      })
      .strict(),
    tests: z
      .object({
        framework: z.enum(["vitest", "jest", "mocha", "node"]),
        command: z.string().min(1).max(500),
        env: z.record(EnvName, z.string().max(200)).default({}),
        test_globs: z.array(Glob).min(1),
        /** E7г / D-314: test IDs that changed status between the two baseline runs; D1 does not count them */
        flaky: z.array(TestId).max(500).optional(),
      })
      .strict(),
    ci: z
      .object({
        provider: z.literal("github_actions"),
        workflow: z.string().min(1).max(200),
        required_checks: z.array(z.string().min(1).max(100)).default([]),
      })
      .strict()
      .nullable()
      .default(null),
    task_types: z.partialRecord(
      TaskType,
      z
        .object({
          allowed_paths: z.array(Glob).min(1),
          may_change_tests: z.boolean(),
          risk_class: RiskClass,
        })
        .strict(),
    ),
    risk_classes: z.partialRecord(
      RiskClass,
      z.object({ level_cap: z.number().int().min(0).max(3), requires_second_factor: z.boolean().default(false) }).strict(),
    ),
    protected_paths: z.array(Glob),
    protected_json_fields: z.record(z.string(), z.array(z.string().min(1))).default({}),
    config_paths: z.array(Glob).default([]),
    budgets: z
      .object({
        task_usd: z.number().positive().max(20),
        task_minutes: z.number().int().min(1).max(120),
        org_usd_day: z.number().positive().max(1000).optional(),
      })
      .strict(),
    models: z
      .object({ allowed: z.array(z.enum(["claude", "codex"])).min(1), default: z.enum(["claude", "codex"]) })
      .strict()
      .default({ allowed: ["claude"], default: "claude" }),
    harness: z
      .object({ required_detectors: z.array(PolicyDetector).default(["D1", "D2", "D3", "D4", "D10"]), max_level: z.number().int().min(0).max(3).default(3) })
      .strict()
      .default({ required_detectors: ["D1", "D2", "D3", "D4", "D10"], max_level: 3 }),
    security: z
      .object({
        max_file_mb: z.number().positive().max(100),
        max_diff_mb: z.number().positive().max(500),
        max_files: z.number().int().positive().max(10000),
        /** GitHub user ids whose PRs are verified without a human approval (т. 6.4, S13) */
        external_agents: z.array(z.number().int().positive()).max(100).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.models.allowed.includes(p.models.default)) ctx.addIssue({ code: "custom", path: ["models", "default"], message: "default must be in allowed" });
    for (const [t, v] of Object.entries(p.task_types)) {
      if (v && !(v.risk_class in p.risk_classes)) ctx.addIssue({ code: "custom", path: ["task_types", t, "risk_class"], message: `unknown risk class ${v.risk_class}` });
    }
  });
export type MandatPolicy = z.infer<typeof MandatPolicy>;

export type ParsedPolicy = { ok: true; policy: MandatPolicy; config_hash: Sha256 } | { ok: false; error: string };

/**
 * YAML 1.2 core schema, no custom tags, no merge keys, no anchors/aliases, unique keys; every warning is an error.
 * config_hash = hashJcs(policy) of the validated object (D-207).
 */
export function parseMandatYml(text: string): ParsedPolicy {
  if (text.length > 256 * 1024) return { ok: false, error: "too large (> 256 KiB)" };
  const doc = parseDocument(text, { schema: "core", customTags: [], merge: false, uniqueKeys: true, prettyErrors: false, strict: true, version: "1.2" });
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length > 0) return { ok: false, error: `yaml: ${problems[0]?.message.split("\n")[0] ?? "invalid"}` };
  let raw: unknown;
  try {
    raw = doc.toJS({ maxAliasCount: 0 });
  } catch (e) {
    return { ok: false, error: `yaml: ${e instanceof Error ? e.message.split("\n")[0] : "invalid"}` };
  }
  const r = MandatPolicy.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: `policy: ${i ? `${i.path.join(".") || "(root)"}: ${i.message}` : "invalid"}` };
  }
  return { ok: true, policy: r.data, config_hash: hashJcs(r.data) };
}

/** Bridge to the E0 detectors: the E0 RepoConfig supports only npm + vitest (F18). */
/** The one install command per package manager (lockfile frozen, no install scripts). */
export const INSTALL_CMD = { npm: "npm ci --ignore-scripts", pnpm: "pnpm install --frozen-lockfile --ignore-scripts", yarn: "yarn install --frozen-lockfile --ignore-scripts" } as const;

export function repoConfigFromPolicy(p: MandatPolicy): { ok: true; config: RepoConfig } | { ok: false; reason: "unsupported_runner"; detail: string } {
  const pm = p.runtime.package_manager;
  const fw = p.tests.framework;
  // D-301: npm, pnpm (lockfile v9) and yarn v1; vitest and jest (both write the same JSON report)
  const install = INSTALL_CMD[pm];
  if ((fw !== "vitest" && fw !== "jest") || p.runtime.install !== install || p.runtime.node !== "24") {
    return { ok: false, reason: "unsupported_runner", detail: `${pm}/${fw}` };
  }
  const config = RepoConfig.parse({
    runtime: { install, node: "24" },
    tests: { command: p.tests.command, format: fw === "jest" ? "jest-json" : "vitest-json", env: p.tests.env, test_globs: p.tests.test_globs, ...(p.tests.flaky?.length ? { flaky: p.tests.flaky } : {}) },
    protected_paths: p.protected_paths,
    protected_json_fields: p.protected_json_fields,
    config_paths: p.config_paths,
    budgets: { task_usd: p.budgets.task_usd, task_minutes: p.budgets.task_minutes },
  });
  return { ok: true, config };
}
