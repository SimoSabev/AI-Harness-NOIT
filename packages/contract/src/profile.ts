import { z } from "zod";
import { UiRoutes } from "./ui.js";
import { hashJcs } from "./hash.js";
import { MandatPolicy, PolicyDetector } from "./policy.js";
import { Glob, Sha256, TaskType } from "./schemas.js";

// v5 2.2: the harness profile, layers A–H. Layer A is the policy (.mandat.yml); the rest are the control layer the
// compiler (packages/profile) turns into each agent's dialect. Hooks are harness scripts only, never a path from the repo.
export const FieldSource = z.enum(["lockfile", "package_json", "ci", "baseline", "rule", "model", "human", "repo_file", "git_history"]);
export type FieldSource = z.infer<typeof FieldSource>;

export const ProfileLayerA = MandatPolicy;
const Cmd = z.string().min(1).max(500);
export const ProfileLayerB = z
  .object({
    summary: z.string().max(2000),
    commands: z.object({ install: Cmd, test: Cmd, test_one: Cmd, lint: Cmd, typecheck: Cmd, dev: Cmd }).partial().strict(),
    boundaries: z.array(z.string().max(300)).max(40),
    task_types: z.array(z.string().max(60)).max(20),
    links: z.array(z.string().max(200)).max(10),
    style: z.array(z.string().max(200)).max(20),
    conventions: z.array(z.string().max(200)).max(20),
  })
  .strict();
export type ProfileLayerB = z.infer<typeof ProfileLayerB>;

export const Subject = z.string().regex(/^(agent:[a-z0-9@._-]+|account:[a-z0-9._-]+|night|research|any)$/);
export type Subject = z.infer<typeof Subject>;
/** "bash:git push *", "path:write:infra/**", "mcp:stripe.*", "net:api.segment.io", "skill:review", "builtin:WebFetch", "mandat:*" */
export const ToolPattern = z
  .string()
  .min(1)
  .max(160)
  .regex(/^(bash|path:read|path:write|mcp|net|skill|builtin|mandat):\S.*$/);
export type ToolPattern = z.infer<typeof ToolPattern>;
export const ToolRule = z.object({ subject: Subject, tool: ToolPattern, decision: z.enum(["allow", "ask", "deny"]), reason: z.string().max(200) }).strict();
export type ToolRule = z.infer<typeof ToolRule>;
export const ProfileLayerC = z.array(ToolRule).max(500);
export type ProfileLayerC = z.infer<typeof ProfileLayerC>;

export const HookScript = z.enum(["deny-by-policy", "lint-changed", "typecheck-changed", "require-tests-ran", "limit-subagents", "record-ask"]);
export type HookScript = z.infer<typeof HookScript>;
export const HookSpec = z
  .object({
    event: z.enum(["pre_tool", "post_tool", "stop", "subagent_stop", "session_start"]),
    matcher: z.string().max(120).nullable(),
    script: HookScript,
    args: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type HookSpec = z.infer<typeof HookSpec>;
export const ProfileLayerD = z.array(HookSpec).max(40);

const McpName = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/);
export const McpServerRef = z
  .object({
    name: McpName,
    transport: z.enum(["stdio", "http"]),
    /** stdio: the pinned package (never @latest); http: the URL behind the gate */
    package: z.string().max(200).regex(/^(?!.*@latest$).+$/).nullable(),
    url: z.string().max(500).nullable(),
    version: z.string().min(1).max(64),
    digest: z.string().max(200).nullable(),
    tools_hash: Sha256.nullable(),
    enabled_tools: z.array(z.string().min(1).max(120)).max(200).nullable(),
    egress_hosts: z.array(z.string().min(1).max(253)).max(50),
    secrets: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(20),
  })
  .strict()
  .refine((m) => (m.transport === "stdio" ? m.package !== null : m.url !== null), { message: "stdio needs a package, http needs a url" });
export type McpServerRef = z.infer<typeof McpServerRef>;
export const SkillRef = z
  .object({
    name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/),
    source: z.enum(["repo", "user", "team", "builtin"]),
    content_hash: Sha256,
    description: z.string().max(200),
  })
  .strict();
export type SkillRef = z.infer<typeof SkillRef>;
export const ProfileLayerE = z
  .object({ mcp: z.array(McpServerRef).max(30), skills: z.array(SkillRef).max(60), plugins: z.array(z.string().max(80)).max(30) })
  .strict();

// D-341: layer F is { roles: [...] } (the .and().transform() form in v5 2.2 does not type well).
export const AgentRoleDef = z
  .object({
    role: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
    model: z.string().max(64),
    tools: z.array(ToolPattern).max(50),
    max_turns: z.number().int().min(1).max(200),
    description: z.string().max(300),
  })
  .strict();
export type AgentRoleDef = z.infer<typeof AgentRoleDef>;
export const ProfileLayerF = z.object({ roles: z.array(AgentRoleDef).max(10) }).strict();

export const ProfileLayerG = z
  .object({
    required_detectors: z.array(PolicyDetector),
    mutants: z.number().int().min(0).max(10),
    max_diff_lines: z.number().int().min(1).max(100_000),
    ui_paths: z.array(Glob).max(20),
    /** E9b (D12, D-364): the routes the UI check opens (absent → "/") */
    ui_routes: UiRoutes.optional(),
    definition_of_done: z.partialRecord(TaskType, z.array(z.string().max(200)).max(20)),
    max_subagents: z.number().int().min(0).max(20),
    max_depth: z.number().int().min(0).max(3),
    // v5 E8е/E8ж/E9б/E9г knobs, here so the contract does not move later (D-341)
    wip_limit: z.number().int().min(1).max(20).default(3),
    ci_rounds: z.number().int().min(0).max(5).default(2),
    same_file: z.enum(["wait", "allow"]).default("wait"),
    review: z.enum(["off", "advisory"]).default("off"),
    hidden_tests_dir: Glob.default("tests/__hidden__"),
    requires_research: z.array(TaskType).default([]),
  })
  .strict();
export type ProfileLayerG = z.infer<typeof ProfileLayerG>;

export const ModelRole = z.enum(["lead", "subagent", "research", "review", "summary"]);
export const RoutingRule = z
  .object({
    task_type: TaskType.nullable(),
    role: ModelRole,
    mode: z.enum(["fixed", "auto"]),
    channel: z.string().max(64).nullable(),
    fallback: z.array(z.string().max(64)).max(5),
  })
  .strict();
export type RoutingRule = z.infer<typeof RoutingRule>;
export const ProfileLayerH = z.object({ budgets: MandatPolicy.shape.budgets, routing: z.array(RoutingRule).max(20) }).strict();

export const ProfileLayers = z
  .object({ a: ProfileLayerA, b: ProfileLayerB, c: ProfileLayerC, d: ProfileLayerD, e: ProfileLayerE, f: ProfileLayerF, g: ProfileLayerG, h: ProfileLayerH })
  .strict();
export type ProfileLayers = z.infer<typeof ProfileLayers>;
export type ProfileLayersInput = z.input<typeof ProfileLayers>;

export function profileHash(layers: ProfileLayersInput): Sha256 {
  return hashJcs(ProfileLayers.parse(layers));
}

const RepoRef = z.union([z.literal("local"), z.string().uuid()]);
export const HarnessProfile = z
  .object({
    version: z.number().int().min(1),
    repo_id: RepoRef,
    layers: ProfileLayers,
    sources: z.record(z.string().max(120), FieldSource),
    profile_hash: Sha256,
    approved_by: z.string().uuid().nullable(),
    approved_at: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (hashJcs(p.layers) !== p.profile_hash) ctx.addIssue({ code: "custom", path: ["profile_hash"], message: "profile_hash != hashJcs(layers)" });
    if ((p.approved_by === null) !== (p.approved_at === null)) ctx.addIssue({ code: "custom", path: ["approved_at"], message: "approved_by and approved_at go together" });
  });
export type HarnessProfile = z.infer<typeof HarnessProfile>;

export function sealProfile(p: Omit<z.input<typeof HarnessProfile>, "profile_hash">): HarnessProfile {
  const layers = ProfileLayers.parse(p.layers);
  return HarnessProfile.parse({ ...p, layers, profile_hash: hashJcs(layers) });
}

export const CompileTarget = z.enum(["claude", "codex", "gemini", "local"]);
export type CompileTarget = z.infer<typeof CompileTarget>;
const MatPath = z
  .string()
  .min(1)
  .max(256)
  .refine((s) => !s.startsWith("/") && !s.split("/").includes("..") && !s.includes("\\"), { message: "relative, no .." });
const RuleNote = z.object({ rule: z.string().max(200), why: z.string().max(300) }).strict();
export const Materialized = z
  .object({
    files: z.array(z.object({ path: MatPath, bytes: z.string().max(1_000_000), mode: z.enum(["0444", "0555"]) }).strict()).max(200),
    argv: z.array(z.string().max(4000)).max(200),
    env: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string().max(4000)),
    enforced_by_harness: z.array(RuleNote),
    unsupported: z.array(RuleNote),
  })
  .strict();
export type Materialized = z.infer<typeof Materialized>;
