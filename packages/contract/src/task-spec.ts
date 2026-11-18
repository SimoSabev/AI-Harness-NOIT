import { z } from "zod";
import { hashJcs } from "./hash.js";
import { isHiddenPath } from "./hidden-path.js";
import { GitSha, Sha256, VerdictResult } from "./schemas.js";
import { ProofKind, TaskProfileId } from "./task-profile.js";

// Х0 (D-532, docs/prd/heavy-process.md §2–§8): the spec with checkable criteria, the hidden oracle, a unit of work,
// the handoff note and the seal of a session. Hashes are JCS + sha256 (hashJcs), like the contract (D-122).

const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;
const Line = z.string().trim().min(1).max(300);
const Instant = z.string().datetime();

export const CriterionId = z.string().regex(/^AC-[1-9]\d{0,3}$/);
export type CriterionId = z.infer<typeof CriterionId>;

/** "WHEN <when> THE SYSTEM SHALL <shall>". when/shall may be blank in a draft; untestableCriteria flags it */
export const AcceptanceCriterion = z
  .object({ id: CriterionId, when: z.string().max(600), shall: z.string().max(600), proof: ProofKind })
  .strict();
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

export const Spec = z
  .object({
    goal: z.string().trim().min(1).max(600),
    product: z.string().max(40_000),
    criteria: z
      .array(AcceptanceCriterion)
      .min(1)
      .max(200)
      .refine((cs) => unique(cs.map((c) => c.id)), "criterion ids repeat"),
    unchanged: z.array(Line).max(100),
    out_of_scope: z.array(Line).max(100),
    profile: TaskProfileId,
  })
  .strict();
export type Spec = z.infer<typeof Spec>;

export function specHash(spec: Spec): Sha256 {
  return hashJcs(spec);
}

/** the profiles whose "done" must rest on a machine check, not only on a person */
export const PROFILES_NEED_TESTS: readonly TaskProfileId[] = ["new_product", "feature", "migration", "refactor", "upgrade", "hardening", "tests", "infra"];

/**
 * Deterministic and deliberately simple (D-532): a criterion is untestable when its when or shall is blank, or when
 * its proof is "human" in a profile that needs a machine check (all but research and other). Vague wording is the
 * interview's job, not this function's.
 */
export function untestableCriteria(spec: Spec): AcceptanceCriterion[] {
  const needsTests = PROFILES_NEED_TESTS.includes(spec.profile);
  return spec.criteria.filter((c) => c.when.trim() === "" || c.shall.trim() === "" || (needsTests && c.proof === "human"));
}

/** D-536: an oracle test's path from the repo root: relative, forward slashes, no "..", inside a __hidden__ folder */
export const OraclePath = z.string().min(1).max(300).refine(isHiddenPath, "a relative path with forward slashes inside a __hidden__ folder");

export const OracleManifest = z
  .object({
    spec_hash: Sha256,
    hidden_tests: z.array(z.object({ path: OraclePath, sha256: Sha256 }).strict()).max(500),
    differential: z.object({ reference: z.string().trim().min(1).max(500), command: z.string().trim().min(1).max(500) }).strict().optional(),
    e2e: z.array(Line).max(100).optional(),
    red_on_base: z.array(z.object({ criterion_id: CriterionId, red: z.boolean() }).strict()).max(200),
    approved: z.object({ by: z.string().trim().min(1).max(100), at: Instant }).strict().optional(),
  })
  .strict();
export type OracleManifest = z.infer<typeof OracleManifest>;

/** the hash covers what the oracle checks, not who approved it: the approval signs this hash */
export function oracleHash(m: OracleManifest): Sha256 {
  const { approved: _approved, ...content } = m;
  return hashJcs(content);
}

export const WorkUnitId = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);
export type WorkUnitId = z.infer<typeof WorkUnitId>;

export const WorkUnit = z
  .object({
    id: WorkUnitId,
    criteria: z.array(CriterionId).max(200),
    title: z.string().trim().min(1).max(200),
    depends_on: z.array(WorkUnitId).max(200),
    status: z.enum(["pending", "running", "passed", "failed", "blocked"]),
  })
  .strict()
  .refine((u) => !u.depends_on.includes(u.id), "a unit cannot depend on itself");
export type WorkUnit = z.infer<typeof WorkUnit>;

export const Handoff = z
  .object({
    unit_id: WorkUnitId,
    done: z.string().trim().min(1).max(2000),
    deviations: z.array(Line).max(50),
    risks: z.array(Line).max(50),
    commit: GitSha.optional(),
  })
  .strict();
export type Handoff = z.infer<typeof Handoff>;

export const SessionSeal = z
  .object({
    spec_hash: Sha256,
    oracle_hash: Sha256,
    profile: TaskProfileId,
    verdict: VerdictResult,
    result_ref: z.string().trim().min(1).max(200),
    unchecked: z.array(Line).max(100),
    ledger_head: Sha256.optional(),
  })
  .strict();
export type SessionSeal = z.infer<typeof SessionSeal>;
