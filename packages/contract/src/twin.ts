import { z } from "zod";
import { Sha256, TaskId, TaskType } from "./schemas.js";

// D-523 (round 1, feature 2 „Двойникът на собственика“, approved by Simo 15.11.2026): the owner's twin learns from the
// owner's own decisions in the ledger. In shadow it only predicts and is scored against the real decision; a class it
// predicts well is offered ONCE as a rule, and only after the owner approves that rule does the twin decide that class,
// within a weekly budget, bound to the policy hash it was approved under.

/** The limits of the twin; a rule can never ask for more than these. */
export const TWIN_LIMITS = Object.freeze({
  /** decisions per class before it may be offered as a rule */
  min_decided: 8,
  /** the Wilson lower bound of the shadow accuracy before it may be offered */
  min_lower: 0.8,
  /** the twin's own decisions per rule per week */
  weekly_budget: 5,
  /** below this share of the weighted history the twin abstains */
  abstain_below: 0.7,
  /** fewer decisions than this in the class: the twin abstains */
  min_history: 3,
  /** a decision's weight halves every this many days */
  half_life_days: 30,
});

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/);
const Part = z.string().regex(/^[a-z0-9_:.-]{1,80}$/);

export interface TwinClass { repo_id: string; type: TaskType; agent: string; reason: string }
/** "<repo_id>|<type>|<agent>|<reason>": what the owner decides alike */
export const TwinClassKey = z.string().max(300).refine((s) => {
  const p = s.split("|");
  return p.length === 4 && Uuid.safeParse(p[0]).success && TaskType.safeParse(p[1]).success && Part.safeParse(p[2]).success && Part.safeParse(p[3]).success;
}, "not a twin class key");
export type TwinClassKey = z.infer<typeof TwinClassKey>;
export function twinClassKey(c: TwinClass): string {
  return TwinClassKey.parse(`${c.repo_id}|${c.type}|${c.agent}|${c.reason}`);
}

export const TwinChoice = z.enum(["approved", "rejected"]);
export type TwinChoice = z.infer<typeof TwinChoice>;

export const TwinPrediction = z.object({
  task_id: TaskId,
  attempt: z.number().int().min(1),
  class_key: TwinClassKey,
  predicted: z.union([TwinChoice, z.literal("abstain")]),
  /** the weighted share of the predicted choice in the class history */
  p: z.number().min(0).max(1),
  /** how many decisions the prediction stands on */
  n: z.number().int().min(0),
  at: Instant,
}).strict();
export type TwinPrediction = z.infer<typeof TwinPrediction>;

export const TwinRule = z.object({
  org_id: Uuid,
  class_key: TwinClassKey,
  approved_by: Uuid,
  approved_at: Instant,
  weekly_budget: z.number().int().min(1).max(TWIN_LIMITS.weekly_budget),
  /** the approved harness profile's hash at approval; a changed policy ends the rule */
  policy_hash: Sha256,
  /** a declined offer is a rule revoked at once, so it is never offered again */
  revoked_at: Instant.nullable(),
}).strict();
export type TwinRule = z.infer<typeof TwinRule>;
