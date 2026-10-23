import { z } from "zod";

export const Sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/); // "sha256:<64 hex>"
export type Sha256 = z.infer<typeof Sha256>;
export const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
export type GitSha = z.infer<typeof GitSha>;
export const TaskId = z.string().regex(/^t_[a-z0-9_]{1,40}$/);
export type TaskId = z.infer<typeof TaskId>;
export const RunId = z.string().regex(/^r_[0-9A-HJKMNP-TV-Z]{26}$/); // ULID (Crockford)
export type RunId = z.infer<typeof RunId>;
// D-226: the E0 local org or a Supabase org uuid.
export const OrgId = z.union([z.literal("o_local"), z.string().uuid()]);
export type OrgId = z.infer<typeof OrgId>;
// D-360: "free" = no scope limits (the whole repo; tests may change), asked for by Simo 23.10.2026
export const TaskType = z.enum(["bugfix", "feature", "css", "docs", "free"]);
export type TaskType = z.infer<typeof TaskType>;
export const Glob = z
  .string()
  .min(1)
  .max(256)
  .refine((s) => !s.startsWith("/") && !s.includes(".."));
export const TestId = z
  .string()
  .min(5)
  .max(1000)
  .regex(/^[^\s>][^>]* > .+/); // D-025
export const ChannelRef = z.object({
  label: z.string().min(1),
  kind: z.enum(["api_key", "cli_profile", "local"]),
  model: z.string().min(1),
});
export type ChannelRef = z.infer<typeof ChannelRef>;
export const SecurityLimits = z.object({
  max_file_mb: z.number().positive().max(100),
  max_diff_mb: z.number().positive().max(500),
  max_files: z.number().int().positive().max(10000),
});
export type SecurityLimits = z.infer<typeof SecurityLimits>;
export const RepoConfig = z.object({
  // D-301: the install command names the package manager (packageManagerOf); its lockfile decides the gate allowlist
  runtime: z.object({ install: z.enum(["npm ci --ignore-scripts", "pnpm install --frozen-lockfile --ignore-scripts", "yarn install --frozen-lockfile --ignore-scripts", "bun install --frozen-lockfile --ignore-scripts"]), node: z.literal("24") }),
  tests: z.object({
    command: z.string().min(1).max(500), // run with /bin/sh -c in the test sandbox
    format: z.enum(["vitest-json", "jest-json", "node-test"]), // D-301: jest --json has the same shape (testResults[].assertionResults[]); D-358: so does the node --test reporter
    env: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string().max(200)),
    test_globs: z.array(Glob).min(1),
    /** E7г / D-314: optional, so contracts without it keep their hash */
    flaky: z.array(TestId).max(500).optional(),
  }),
  protected_paths: z.array(Glob),
  protected_json_fields: z.record(z.string(), z.array(z.string().min(1))),
  config_paths: z.array(Glob), // subset of protected_paths (class config)
  budgets: z.object({ task_usd: z.number().positive().max(20), task_minutes: z.number().int().min(1).max(120) }),
});
export type RepoConfig = z.infer<typeof RepoConfig>;
export function packageManagerOf(rc: Pick<RepoConfig, "runtime">): "npm" | "pnpm" | "yarn" | "bun" {
  const i = rc.runtime.install;
  return i.startsWith("pnpm ") ? "pnpm" : i.startsWith("yarn ") ? "yarn" : i.startsWith("bun ") ? "bun" : "npm";
}
export const Contract = z
  .object({
    task_id: TaskId,
    type: TaskType,
    agent: z.enum(["claude", "codex"]),
    text: z.string().min(1).max(4000),
    base_commit: GitSha,
    config_hash: Sha256,
    scan_facts_hash: z.null(),
    allowed_paths: z.array(Glob).min(1),
    may_change_tests: z.boolean(),
    must_pass: z.array(TestId),
    hidden_tests: z.object({ path: z.string(), min_count: z.number().int().min(0) }).nullable(),
    risk_cap: z.number().int().min(0).max(3),
    memory_hash: Sha256.nullable(),
    channel: ChannelRef,
    security: SecurityLimits,
    repo_config: RepoConfig,
    contract_hash: Sha256,
  })
  .strict();
export type Contract = z.infer<typeof Contract>;
// Input of `contract seal` (D-122): the hashes are missing or stale.
export const UnsealedContract = Contract.omit({ config_hash: true, contract_hash: true })
  .extend({ config_hash: Sha256.optional(), contract_hash: Sha256.optional() })
  .strict();
export type UnsealedContract = z.infer<typeof UnsealedContract>;

// 6.2 Projection for the agent.
export const AgentContract = z
  .object({
    text: z.string(),
    type: TaskType,
    allowed_paths: z.array(Glob),
    may_change_tests: z.boolean(),
    must_pass: z.array(TestId),
    limits: SecurityLimits,
    commands: z.object({ install: z.string(), test: z.literal("npx vitest run") }),
    memory_block: z.null(), // E0 (D-022)
  })
  .strict();
export type AgentContract = z.infer<typeof AgentContract>;

// 6.3 Evidence and verdict.
export const DetectorId = z.enum([
  "EXPORT",
  "INTEGRITY",
  "D10.lockfile",
  "D1.base_tests",
  "D2.inventory",
  "D3.protected",
  "D4.contract",
  "MUST_PASS",
  "CANARY",
  "AGENT",
  "INFRA",
  "PLACEHOLDER",
  "D7.ci",
  "POLICY",
  "D11.mutation", // D-300: mutants of the changed lines must be caught by the tests
  // v5 2.6 (D-341: named like the others, <id>.<what>)
  "D5.hidden",
  "D8.static",
  "D12.ui",
  "RESEARCH",
  "REVIEW",
]);
export type DetectorId = z.infer<typeof DetectorId>;
export const Evidence = z
  .object({
    detector: DetectorId,
    phase: z.union([z.literal(1), z.literal(2)]),
    status: z.enum(["pass", "fail", "unknown", "n/a"]),
    summary: z.string().max(300), // after redaction
    data: z.record(z.string(), z.unknown()), // after redaction
    source: z.enum(["sandbox:verify", "worker", "export", "gate", "proxy", "github:observer"]),
    artifact_hash: Sha256.optional(),
    agent_visible: z.boolean(), // true for everything in E0 (no D5)
    signature: z.string().max(300).optional(), // required for fail/unknown
  })
  .strict();
export type Evidence = z.infer<typeof Evidence>;
export const VerdictResult = z.enum(["VERIFIED", "FAILED", "UNKNOWN"]);
export type VerdictResult = z.infer<typeof VerdictResult>;
// Демо промпт т. 3.3: full = our harness; external = a change from an agent outside our sandbox.
export const VerifyMode = z.enum(["full", "external"]);
export type VerifyMode = z.infer<typeof VerifyMode>;
export const TimingKey = z.enum(["provision", "install", "agent", "export", "verify", "verdict", "total"]);
export const Verdict = z
  .object({
    run_id: RunId,
    task_id: TaskId,
    attempt: z.number().int().min(1),
    mode: VerifyMode.default("full"),
    agent: z.string(),
    result: VerdictResult,
    reasons: z.array(z.string()), // D-039
    evidence: z.array(Evidence),
    contract_hash: Sha256,
    base_sha: GitSha,
    tree_sha: GitSha.nullable(),
    diff_hash: Sha256.nullable(),
    integrity: z.enum(["ok", "mismatch", "n/a"]),
    usage: z.object({
      usd: z.number().min(0),
      input_tokens: z.number().int(),
      output_tokens: z.number().int(),
      requests: z.number().int(),
    }),
    timings_ms: z.record(TimingKey, z.number().int().min(0)), // D-063: exhaustive in zod 4
    created_at: z.string().datetime(),
  })
  .strict();
export type Verdict = z.infer<typeof Verdict>;

// 6.4 Changeset export.
export const ChangedFile = z.object({
  path: z.string(),
  status: z.enum(["A", "M", "D", "R"]),
  old_path: z.string().optional(),
  bytes: z.number().int(),
  binary: z.boolean(),
});
export type ChangedFile = z.infer<typeof ChangedFile>;
export const ExportReasonCode = z.enum([
  "symlink",
  "hardlink",
  "device",
  "fifo",
  "git_path",
  "gitmodules",
  "binary_too_large",
  "file_too_large",
  "too_many_files",
  "diff_too_large",
  "path_traversal",
  "non_utf8_path",
  "tar_too_large",
  "unreadable",
]); // D-061; path "-" for archive-level codes
export type ExportReasonCode = z.infer<typeof ExportReasonCode>;
export const ChangesetExport = z
  .object({
    ok: z.literal(true),
    run_id: RunId,
    base_sha: GitSha,
    tree_sha: GitSha,
    diff_hash: Sha256,
    diff_bytes: z.number().int(),
    files: z.array(ChangedFile),
  })
  .strict();
export type ChangesetExport = z.infer<typeof ChangesetExport>;
export const ExportRejection = z
  .object({
    ok: z.literal(false),
    run_id: RunId,
    reasons: z.array(z.object({ code: ExportReasonCode, path: z.string() })).min(1),
  })
  .strict();
export type ExportRejection = z.infer<typeof ExportRejection>;

// 6.5 Ledger and security events (JSON Lines, UTF-8, LF).
// D-226 / спец. т. 10: E0 kinds + the online ones; "external_verdict" is new in the demo prompt.
export const LedgerKind = z.enum([
  "task_created",
  "memory_snapshot",
  "security_event",
  "verdict",
  "gated",
  "delivered",
  "approval",
  "outcome",
  "ladder_change",
  "ladder_pin",
  "config_change",
  "channel_change",
  "routing_change",
  "channel_limit",
  "channel_spill",
  "channel_manual_switch",
  "task_stopped",
  "task_retry",
  "failure_label",
  "lease_lost",
  "step_requeued",
  "integrity_mismatch",
  "demo_reset",
  "external_verdict",
  // v5 2.6
  "profile_change",
  "role_change",
  "tool_permission",
  "mcp_change",
  "night_question",
  "night_start", // E9а
  "night_done",
  "research_run",
  "conflict",
  "parked",
]);
export type LedgerKind = z.infer<typeof LedgerKind>;
export const LedgerEntry = z
  .object({
    org_id: OrgId,
    seq: z.number().int().min(1),
    ts: z.string().datetime(), // ISO UTC with ms
    kind: LedgerKind,
    task_id: TaskId.nullable(),
    payload_hash: Sha256.nullable(),
    prev_hash: Sha256.nullable(),
    hash: Sha256,
  })
  .strict();
export type LedgerEntry = z.infer<typeof LedgerEntry>;
export const SecurityEventKind = z.enum([
  "proxy_block",
  "dns_block",
  "canary_hit",
  "budget_stop",
  "config_path_change",
  "tree_mismatch",
  "redaction_hit",
  // v5 2.6 (+ config_change for SH2-CX: the seeded agent config changed during the run)
  "tool_poisoning",
  "mcp_definition_changed",
  "ask_denied",
  "conflict_file",
  "config_change",
]);
export type SecurityEventKind = z.infer<typeof SecurityEventKind>;
export const SecurityEvent = z
  .object({
    id: z.string().regex(/^se_[0-9A-HJKMNP-TV-Z]{26}$/),
    org_id: OrgId,
    task_id: TaskId.nullable(),
    run_id: RunId.nullable(),
    attempt: z.number().int().min(1).nullable(),
    kind: SecurityEventKind,
    severity: z.enum(["info", "warn", "incident"]),
    detail: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])), // after redaction
    source: z.enum(["gate", "proxy", "export", "worker", "verify"]),
    created_at: z.string().datetime(),
  })
  .strict();
export type SecurityEvent = z.infer<typeof SecurityEvent>;
