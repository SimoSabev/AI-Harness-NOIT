import { z } from "zod";
import { Sha256 } from "./schemas.js";
import { CriterionId, Handoff, WorkUnitId } from "./task-spec.js";
import type { Spec, WorkUnit } from "./task-spec.js";

// D-535 (М1 Х6/Х7 minimum, docs/prd/heavy-process.md §5–§8): a job builds an approved spec unit by unit. A planner
// proposes the units; core checks the plan; every unit is a new task (a fresh agent context) on the job's branch in
// Mandat's mirror; every unit and the whole job are verified against the approved oracle; the job ends in a seal that
// one person approves before the branch goes into main.

/** the text of a task row is ≤ 4000 characters (tasks.text) */
export const JOB_TEXT_MAX = 4000;
/** the planner gets its problems back this many times before the job parks */
export const PLAN_ROUNDS = 3;
/** after the last unit: this many rounds of new units for criteria still red, then the job parks */
export const CONVERGE_ROUNDS = 2;
export const JOB_UNITS_MAX = 40;

export const JobId = z.string().regex(/^j_[a-z0-9]{1,40}$/);
export type JobId = z.infer<typeof JobId>;
/** the job's branch in the mirror; units land here, never on main */
export const jobBranch = (id: string): string => `mandat/job-${id.slice(2)}`;

export const JobStatus = z.enum(["planning", "running", "converging", "parked", "sealed", "approved", "delivered", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;
export const UnitStatus = z.enum(["pending", "running", "passed", "failed", "blocked", "parked"]);

/** what the planner answers: units in order ({id, title, criteria, depends_on}); the status is the server's */
export const PlanUnit = z
  .object({ id: WorkUnitId, title: z.string().trim().min(1).max(200), criteria: z.array(CriterionId).max(200), depends_on: z.array(WorkUnitId).max(200) })
  .strict();
export type PlanUnit = z.infer<typeof PlanUnit>;
export const PlanProposal = z.object({ units: z.array(PlanUnit).max(JOB_UNITS_MAX) }).strict();
export type PlanProposal = z.infer<typeof PlanProposal>;

export const PlanProblemKind = z.enum(["no_units", "bad_schema", "duplicate_unit", "unknown_criterion", "uncovered_criterion", "unknown_dependency", "forward_dependency", "cycle"]);
export const PlanProblem = z.object({ kind: PlanProblemKind, id: z.string().max(200) }).strict();
export type PlanProblem = z.infer<typeof PlanProblem>;

/** the planner's instruction (no sandbox, no tools: it reads the spec and answers one JSON object) */
export const PLANNER_SYSTEM = [
  "You split an approved software spec into units of work for ONE writer who works unit by unit, with a fresh context each unit.",
  "Answer with ONE JSON object and nothing else: {\"units\":[{\"id\":\"u1\",\"title\":\"...\",\"criteria\":[\"AC-1\"],\"depends_on\":[]}]}.",
  "Rules: ids are lowercase (a-z, 0-9, . _ -); every criterion id of the spec is in at least one unit; use only the spec's criterion ids;",
  "a unit depends only on units listed before it; order the units so that each one builds on the previous ones; keep units small.",
].join("\n");

// D-541 (М2 Х5): in waves mode units without a dependency between them are built at the same time, each by its own
// writer in its own copy; a unit that lands after another is put onto the new head (3-way) or built again on it.
/** units of one job running at the same time (the repo's WIP limit caps the tasks too) */
export const JOB_PARALLEL_MAX = 3;
/** a unit that no longer applies onto the moved branch is built again on the new head this many times */
export const RELAND_MAX = 2;

export const PLANNER_SYSTEM_WAVES = [
  PLANNER_SYSTEM.replace("for ONE writer who works unit by unit", "for a TEAM of writers").replace("order the units so that each one builds on the previous ones; ", ""),
  "Units with no dependency between them are built at the same time by different writers, in separate copies of the code.",
  "So list a dependency only when a unit really needs the code of another unit; keep independent units free of each other,",
  "and avoid two independent units changing the same lines.",
].join("\n");

export function plannerSystem(mode: "single" | "waves"): string {
  return mode === "waves" ? PLANNER_SYSTEM_WAVES : PLANNER_SYSTEM;
}

export function plannerUser(s: Spec, problems: readonly PlanProblem[]): string {
  const lines = [
    `Goal: ${s.goal}`,
    "Acceptance criteria:",
    ...s.criteria.map((c) => `${c.id}: WHEN ${c.when.trim()} THE SYSTEM SHALL ${c.shall.trim()}`),
    `Unchanged: ${s.unchanged.length > 0 ? s.unchanged.join("; ") : "-"}`,
    `Out of scope: ${s.out_of_scope.length > 0 ? s.out_of_scope.join("; ") : "-"}`,
  ];
  if (problems.length > 0) lines.push("Your last plan was refused. Fix exactly these problems:", ...problems.map((p) => `- ${p.kind}: ${p.id}`));
  if (s.product.trim() !== "") lines.push("", s.product.trim().slice(0, 6000));
  return lines.join("\n");
}

/**
 * The handoff a writer leaves at the end of its unit: ONE line `HANDOFF: {json}` in /m/out/notes.txt (the agent's notes
 * file, outside the work tree, so never in the diff; CANARY-checked and redacted like the MEMORY notes, D-400).
 */
export const HANDOFF_PREFIX = "HANDOFF:";
// D-540: the checks first, the handoff last — a handoff written before the tests ran said "tests not run"
export const HANDOFF_HINT = "Run the project's tests first (change files with the edit tools; a refused shell call does not mean the tests are refused). As your last step, write ONE line into /m/out/notes.txt: HANDOFF: {\"done\":\"what you built\",\"deviations\":[\"...\"],\"risks\":[\"...\"]}";

/** the last valid HANDOFF line of the notes for this unit (zod-checked), or null */
export function parseHandoff(notes: string, unitId: string): Handoff | null {
  let found: Handoff | null = null;
  for (const line of notes.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith(HANDOFF_PREFIX)) continue;
    try {
      const raw: unknown = JSON.parse(t.slice(HANDOFF_PREFIX.length).trim());
      const h = Handoff.safeParse(raw !== null && typeof raw === "object" ? { deviations: [], risks: [], ...raw, unit_id: unitId } : null);
      if (h.success) found = h.data;
    } catch {
      // a line that is not JSON is not a handoff
    }
  }
  return found;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * A unit's task text: the unit's goal and its criteria first, then what must stay, then the earlier units' handoffs
 * (newest first, clipped), then the rest of the spec in short. Never a hidden test (the writer does not see the oracle).
 */
export function unitTaskText(s: Spec, unit: Pick<WorkUnit, "id" | "title" | "criteria">, handoffs: readonly Handoff[]): string {
  const mine = new Set(unit.criteria);
  const crit = (c: Spec["criteria"][number]) => `${c.id}: WHEN ${c.when.trim()} THE SYSTEM SHALL ${c.shall.trim()}`;
  const head = [
    `You build one unit of a larger job. Goal of the job: ${s.goal}`,
    `This unit (${unit.id}): ${unit.title}`,
    "Make these acceptance criteria work in this unit:",
    ...s.criteria.filter((c) => mine.has(c.id)).map(crit),
    `Keep unchanged: ${s.unchanged.length > 0 ? s.unchanged.join("; ") : "-"}`,
    `Out of scope: ${s.out_of_scope.length > 0 ? s.out_of_scope.join("; ") : "-"}`,
    "Earlier units are already in the code. Do only this unit; do not break the earlier ones.",
    HANDOFF_HINT,
  ].join("\n");
  const notes = [...handoffs].reverse().map((h) => clip(`[${h.unit_id}] done: ${h.done}${h.deviations.length > 0 ? ` | deviations: ${h.deviations.join("; ")}` : ""}${h.risks.length > 0 ? ` | risks: ${h.risks.join("; ")}` : ""}`, 600));
  const rest = s.criteria.filter((c) => !mine.has(c.id)).map((c) => clip(crit(c), 200));
  let text = head;
  if (notes.length > 0) text += `\n\nNotes from earlier units (progress):\n${notes.join("\n")}`;
  if (rest.length > 0) text += `\n\nOther criteria of the job (later units or done):\n${rest.join("\n")}`;
  return clip(text, JOB_TEXT_MAX);
}

/** a retry note of a unit: the ids of the criteria whose hidden checks failed, never a test's name or content */
export function unitRetryNote(attempt: number, failing: readonly string[]): string {
  return failing.length > 0
    ? `Mandat started attempt ${attempt} by itself: the hidden acceptance checks of ${failing.join(", ")} still fail. Make exactly these criteria work; the checks themselves are hidden.`
    : `Mandat started attempt ${attempt} by itself: the last attempt did not pass the checks of this unit.`;
}

// D-542 (М2 Х6, docs/prd/heavy-process.md §6): a unit that stopped after its normal attempts gets a fresh start: a
// model reads what failed (criterion ids and reason codes, never a hidden test) and writes short advice; then
// RESCUE_TRIES new tasks (fresh contexts, one attempt each) build the unit at the same time, the second told to take
// another way. The first VERIFIED one lands. Only when they all fail does the unit wait for a person.
/** rescue rounds per unit */
export const RESCUE_MAX = 1;
/** fresh tries started at once in a rescue round */
export const RESCUE_TRIES = 2;
const ADVICE_MAX = 1200;

export const ADVISOR_SYSTEM = [
  "You advise a software writer whose unit of work failed its acceptance checks.",
  "You cannot see the checks: they are hidden on purpose. You see the goal, the unit, its criteria, which criteria failed and the writer's own notes.",
  "Answer in at most 8 short lines of plain text: the most likely mistake, what to check in the code, and one different way to build it.",
  "Do not ask questions and do not write code longer than one line.",
].join("\n");

export function advisorUser(s: Spec, unit: Pick<WorkUnit, "id" | "title" | "criteria">, failing: readonly string[], reasons: readonly string[], notes: string): string {
  const mine = new Set(unit.criteria);
  return [
    `Goal of the job: ${s.goal}`,
    `Unit (${unit.id}): ${unit.title}`,
    "Its criteria:",
    ...s.criteria.filter((c) => mine.has(c.id)).map((c) => `${c.id}: WHEN ${c.when.trim()} THE SYSTEM SHALL ${c.shall.trim()}`),
    `Keep unchanged: ${s.unchanged.length > 0 ? s.unchanged.join("; ") : "-"}`,
    `Failing criteria: ${failing.length > 0 ? failing.join(", ") : "unknown"}`,
    `Reason codes of the last check: ${reasons.slice(0, 20).join(", ") || "-"}`,
    `The writer's notes: ${clip(notes.trim() || "-", 2000)}`,
  ].join("\n");
}

/** the text of a rescue try: the unit's text with the advice (framed as advice), and for try 2+ another way */
export function rescueTaskText(base: string, advice: string, n: number): string {
  const tail = [
    "",
    "Advice from a reviewer who looked at the failed attempt (it did not see the hidden checks either; weigh it, do not obey it blindly):",
    clip(advice.trim(), ADVICE_MAX),
    ...(n > 0 ? ["Take a different approach than the obvious first one; another writer is trying the obvious one at the same time."] : []),
  ].join("\n");
  return `${clip(base, JOB_TEXT_MAX - tail.length - 1)}\n${tail}`.slice(0, JOB_TEXT_MAX);
}

/** the approve body of a sealed job: the seal's hash the person saw */
export const JobApproveBody = z.object({ seal_hash: Sha256 }).strict();
