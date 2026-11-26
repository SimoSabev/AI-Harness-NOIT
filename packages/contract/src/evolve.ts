import { z } from "zod";
import { LEARN_LIMITS, LearnSource } from "./learn.js";
import { ToolPattern } from "./profile.js";
import { TaskId, TaskType, TestId } from "./schemas.js";

// D-530 (round 2, approved by Simo 16.11.2026): profile evolution with evidence. A failure class that recurs in a
// project becomes a proposed change of its harness profile, with a manifest: the change (one of a fixed set of
// narrowing rules, never text an LLM wrote), the tasks it stands on, and a prediction the next tasks can falsify.
// A narrowing change that passes the bench gate is accepted by Mandat; a failed prediction rolls it back.

export const EVOLVE_LIMITS = Object.freeze({
  /** failures of one class in the window before a change is proposed */
  min_evidence: 3,
  window_days: 30,
  /** the prediction is checked over this many next tasks of the task type */
  next_n: 10,
});

/** the fixed narrowing rules; each maps to one layer */
export const ProfileChangeRule = z.enum(["tests_kept", "lint_hook", "type_hook", "protect_path", "no_test_env", "no_hidden_probe", "flaky_test", "tool_allow", "tool_deny"]); // D-549: no_test_env, no_hidden_probe; D-641: the last three
export type ProfileChangeRule = z.infer<typeof ProfileChangeRule>;

// a path glob or nothing: printable, no whitespace controls, no zero-width or bidi characters
const hidden = (c: number) => c < 0x20 || c === 0x7f || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x2064) || c === 0xfeff;
const Detail = z.string().max(200).refine((s) => ![...s].some((ch) => hidden(ch.codePointAt(0) ?? 0)), "invisible or control character");

/** D-641: the layer each rule changes; a change names it and the detail reads as what the rule changes */
const LAYER_OF: Record<ProfileChangeRule, "a" | "b" | "c" | "d"> = { tests_kept: "b", no_test_env: "b", no_hidden_probe: "b", lint_hook: "d", type_hook: "d", protect_path: "c", flaky_test: "a", tool_allow: "c", tool_deny: "c" };
export const ProfileChange = z
  .object({ rule: ProfileChangeRule, layer: z.enum(["a", "b", "c", "d", "g"]), detail: Detail })
  .strict()
  .refine((c) => LAYER_OF[c.rule] === c.layer, "the layer does not match the rule")
  .refine((c) => c.rule !== "flaky_test" || TestId.safeParse(c.detail).success, "a flaky test is a test id")
  .refine((c) => (c.rule !== "tool_allow" && c.rule !== "tool_deny") || ToolPattern.safeParse(c.detail).success, "a tool rule names a tool pattern");
export type ProfileChange = z.infer<typeof ProfileChange>;

/** D-641: a flaky test needs two tasks, a tool decision five, a D-530 class three */
export function minEvidence(rule: ProfileChangeRule): number {
  return rule === "flaky_test" ? LEARN_LIMITS.flaky_min : rule === "tool_allow" || rule === "tool_deny" ? LEARN_LIMITS.ask_min : EVOLVE_LIMITS.min_evidence;
}
export const ProfileManifest = z.object({
  change: ProfileChange,
  evidence: z.array(TaskId).min(LEARN_LIMITS.flaky_min).max(50),
  /** "<DETECTOR>:<class>" of the verdict reasons, e.g. D2:missing_test */
  reason_class: z.string().regex(/^[A-Z][A-Z0-9_]{0,20}:[a-z_]{1,40}$/),
  prediction: z.object({ task_type: TaskType, next_n: z.number().int().min(1).max(100), max_repeats: z.number().int().min(0).max(10) }).strict(),
  /** D-641: the rule that proposed it (rule:d4_repeat …); trials before E9д have none */
  source: LearnSource.optional(),
}).strict().refine((m) => m.evidence.length >= minEvidence(m.change.rule), "too little evidence for the rule");
export type ProfileManifest = z.infer<typeof ProfileManifest>;

export const ProfileTrialStatus = z.enum(["proposed", "benched", "accepted", "refused", "rolled_back"]);
export type ProfileTrialStatus = z.infer<typeof ProfileTrialStatus>;
