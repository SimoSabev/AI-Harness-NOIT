import { z } from "zod";

// Х0 (D-532, docs/prd/heavy-process.md §0): a heavy task is understood on six axes. Every axis may still be "unknown";
// the interview goes on while any axis is unknown (unknownAxes). The axes decide the profile and its plan
// (deriveProfile in @mandat/core).

const UNKNOWN = z.literal("unknown");
const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;

export const ProofKind = z.enum(["tests", "ui", "differential", "numbers", "human"]);
export type ProofKind = z.infer<typeof ProofKind>;

export const ReferenceKind = z.enum(["old_system", "reference_impl", "standard"]);
export type ReferenceKind = z.infer<typeof ReferenceKind>;

export const Reference = z.object({ kind: ReferenceKind, locator: z.string().trim().min(1).max(500) }).strict();
export type Reference = z.infer<typeof Reference>;

export const Risk = z.object({ level: z.enum(["low", "medium", "high"]), outward: z.boolean() }).strict();
export type Risk = z.infer<typeof Risk>;

export const TaskAxes = z
  .object({
    code: z.enum(["none", "existing", "unknown"]),
    reference: z.union([z.literal("none"), UNKNOWN, Reference]),
    divisible: z.enum(["no", "yes", "unknown"]),
    proof: z.union([UNKNOWN, z.array(ProofKind).min(1).max(ProofKind.options.length).refine(unique, "proof kinds repeat")]),
    risk: z.union([UNKNOWN, Risk]),
    size: z.enum(["s", "m", "l", "xl", "unknown"]),
  })
  .strict();
export type TaskAxes = z.infer<typeof TaskAxes>;

export const AXIS_NAMES = ["code", "reference", "divisible", "proof", "risk", "size"] as const;
export type AxisName = (typeof AXIS_NAMES)[number];

export const TaskProfileId = z.enum(["new_product", "feature", "migration", "refactor", "upgrade", "hardening", "tests", "infra", "research", "other"]);
export type TaskProfileId = z.infer<typeof TaskProfileId>;

export const OracleKind = z.enum(["hidden_tests", "differential", "e2e", "mutation_graded", "exploit", "citations", "human_review"]);
export type OracleKind = z.infer<typeof OracleKind>;

export const ProfilePlan = z
  .object({
    oracle: z.array(OracleKind).max(OracleKind.options.length).refine(unique, "oracle kinds repeat"),
    /** what one unit of work is called for this profile, e.g. "file" for a migration */
    unit: z.string().trim().min(1).max(60),
    parallel: z.enum(["single", "waves"]),
    pilot: z.boolean(),
  })
  .strict();
export type ProfilePlan = z.infer<typeof ProfilePlan>;

export const TaskProfile = z
  .object({ id: TaskProfileId, name: z.string().trim().min(1).max(80), axes: TaskAxes, plan: ProfilePlan })
  .strict();
export type TaskProfile = z.infer<typeof TaskProfile>;
