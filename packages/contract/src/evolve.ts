import { z } from "zod";
import { TaskId, TaskType } from "./schemas.js";

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
export const ProfileChangeRule = z.enum(["tests_kept", "lint_hook", "type_hook", "protect_path", "no_test_env", "no_hidden_probe"]); // D-549: the last two
export type ProfileChangeRule = z.infer<typeof ProfileChangeRule>;

// a path glob or nothing: printable, no whitespace controls, no zero-width or bidi characters
const hidden = (c: number) => c < 0x20 || c === 0x7f || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x2064) || c === 0xfeff;
const Detail = z.string().max(200).refine((s) => ![...s].some((ch) => hidden(ch.codePointAt(0) ?? 0)), "invisible or control character");

export const ProfileChange = z.object({ rule: ProfileChangeRule, layer: z.enum(["b", "c", "d", "g"]), detail: Detail }).strict();
export type ProfileChange = z.infer<typeof ProfileChange>;

export const ProfileManifest = z.object({
  change: ProfileChange,
  evidence: z.array(TaskId).min(EVOLVE_LIMITS.min_evidence).max(50),
  /** "<DETECTOR>:<class>" of the verdict reasons, e.g. D2:missing_test */
  reason_class: z.string().regex(/^[A-Z][A-Z0-9_]{0,20}:[a-z_]{1,40}$/),
  prediction: z.object({ task_type: TaskType, next_n: z.number().int().min(1).max(100), max_repeats: z.number().int().min(0).max(10) }).strict(),
}).strict();
export type ProfileManifest = z.infer<typeof ProfileManifest>;

export const ProfileTrialStatus = z.enum(["proposed", "benched", "accepted", "refused", "rolled_back"]);
export type ProfileTrialStatus = z.infer<typeof ProfileTrialStatus>;
