import { z } from "zod";

// E9д (spec 5.5, PRD 6.11, D-640/D-641): learning is deterministic statistics over the ledger plus proposals. D-647
// (Simo 26.11.2026): a proposal applies itself after the bench gate and rolls itself back when things get worse. Every proposal names its origin as `rule:<name>`; the names are fixed here, never text a model wrote.

export const LEARN_LIMITS = Object.freeze({
  /** a test id that failed D1 in this many tasks a person labelled as not the agent's fault → tests.flaky */
  flaky_min: 2,
  /** asks for one tool in this many tasks, decided the same way → allow / deny */
  ask_min: 5,
  /** the share of those decisions that must agree */
  ask_share: 0.8,
  /** the learned Q of a channel for a task type replaces the static one after this many outcomes */
  q_min_outcomes: 10,
  /** exponential forgetting: an outcome this many days old weighs half */
  q_half_life_days: 30,
  /** the cost forecast is the median of the last N tasks of (repo, type, agent) */
  cost_last_n: 10,
  /** the default budget is the forecast × this */
  cost_budget_factor: 2,
  /** a week-on-week fall of the VERIFIED share larger than this (relative) is a regression */
  regression_drop: 0.2,
  /** fewer tasks than this in either week say nothing */
  regression_min_week: 5,
  window_days: 30,
  /** D-647: a change that can weaken the verdict is watched over this many tasks of its type after it applied */
  watch_n: 10,
  /** … and says nothing before this many */
  watch_min: 5,
  /** … against the share of failures in this many tasks of the type before it */
  watch_before: 20,
});

export const LearnSource = z.string().regex(/^rule:[a-z0-9_]{1,40}$/);
export type LearnSource = z.infer<typeof LearnSource>;

/** "<DETECTOR>:<class>" → the rule that turns it into a proposal (D-530/D-549 classes and the two of D-641) */
const SOURCE_OF: Readonly<Record<string, string>> = Object.freeze({
  "D4:out_of_contract": "rule:d4_repeat",
  "D3:protected_path": "rule:d3_repeat",
  "D2:missing_test": "rule:d2_repeat",
  "D2:weakened_assertions": "rule:d2_repeat",
  "D2:skipped": "rule:d2_repeat",
  "D8:lint_fail": "rule:lint_repeat",
  "D8:type_fail": "rule:type_repeat",
  "D11:test_env": "rule:test_env_repeat",
  "D13:test_env_branch": "rule:test_env_repeat",
  "D13:hidden_probe": "rule:hidden_probe_repeat",
  "D13:test_config_change": "rule:test_config_repeat",
  "D1:regression": "rule:flaky_repeat",
  "ASK:tool_ask": "rule:ask_repeat",
});

export function sourceOfClass(reasonClass: string): LearnSource | null {
  return Object.hasOwn(SOURCE_OF, reasonClass) ? (SOURCE_OF[reasonClass] as string) : null;
}

const Share = z.number().min(0).max(1);
const Week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A card on the rules screen that is not a profile change: a person reads it and decides (PRD 6.11 т. 6). */
export const LearnCard = z
  .object({
    kind: z.literal("model_regression"),
    source: z.literal("rule:model_regression"),
    /** "<agent>:<model>" */
    model: z.string().min(1).max(200),
    week: Week,
    prev_week: Week,
    share: Share,
    prev_share: Share,
    tasks: z.number().int().min(0),
    prev_tasks: z.number().int().min(0),
  })
  .strict();
export type LearnCard = z.infer<typeof LearnCard>;
