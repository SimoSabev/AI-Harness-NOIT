import { z } from "zod";
import type { Handoff, Spec } from "./task-spec.js";

// D-543 (М2 Х4, docs/prd/heavy-process.md §4): the task harness of a job. Each unit's writer finds, outside the work
// tree and read only, a short map of the job (goal, this unit, the plan with statuses, what stays, the decision log, how
// to start) and a feature list. Unlike a feature list the agent edits itself, here only Mandat sets `passes`, from the
// hidden checks: the writer cannot mark its own work done. Never a hidden test, its name or its content.

/** where the job's files are, read only for the agent (seeded by root before the agent, like /m/in/harness) */
export const JOB_IN = "/m/in/job";
const MAP_MAX = 16_000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface MapUnit { id: string; title: string; criteria: readonly string[]; status: string; depends_on: readonly string[] }

export function jobMapFiles(o: { spec: Spec; mode: "single" | "waves"; units: readonly MapUnit[]; current: string; handoffs: readonly Handoff[] }): { path: string; data: string }[] {
  const s = o.spec;
  const passedUnits = new Set(o.units.filter((u) => u.status === "passed").map((u) => u.id));
  const plan = o.units.slice(0, 60).map((u) => {
    const mark = u.status === "passed" ? "[x]" : "[ ]";
    const state = u.status === "passed" ? "" : ` — ${u.status}${u.depends_on.length > 0 ? `, needs ${u.depends_on.join(", ")}` : ""}`;
    return clip(`- ${mark} ${u.id} ${u.title} (${u.criteria.join(", ")})${state}${u.id === o.current ? "  ← you" : ""}`, 260);
  });
  const log = o.handoffs.slice(-30).map((h) => clip(`- ${h.unit_id}: ${h.done}${h.deviations.length > 0 ? `; deviations: ${h.deviations.join("; ")}` : ""}${h.risks.length > 0 ? `; risks: ${h.risks.join("; ")}` : ""}`, 400));
  const map = [
    `# Job: ${clip(s.goal, 300)}`,
    "",
    `You build unit ${o.current} of this job (${o.mode === "waves" ? "a team: other writers build independent units at the same time, in their own copies" : "one writer, unit by unit"}).`,
    "",
    "## Start here",
    "1. Read `git log --oneline -20` and this file; the earlier units are already in the code.",
    "2. Run the project's tests first; if something is broken, fix that before new work.",
    "3. Do only your unit; do not break the earlier ones; keep what must stay unchanged.",
    `4. features.json lists every criterion; Mandat sets passes from the hidden checks (you cannot and need not edit it).`,
    "",
    "## Plan",
    ...plan,
    "",
    "## Must stay unchanged",
    ...(s.unchanged.length > 0 ? s.unchanged.map((x) => `- ${x}`) : ["- -"]),
    "",
    "## Out of scope",
    ...(s.out_of_scope.length > 0 ? s.out_of_scope.map((x) => `- ${x}`) : ["- -"]),
    "",
    "## Decisions and handoffs of earlier units",
    ...(log.length > 0 ? log : ["- none yet"]),
  ].join("\n");
  const features = {
    note: "Read only. Mandat sets passes from the hidden acceptance checks of the units that passed.",
    features: s.criteria.map((c) => {
      const unit = o.units.filter((u) => u.criteria.includes(c.id)).map((u) => u.id);
      return { id: c.id, when: c.when, shall: c.shall, proof: c.proof, unit, passes: unit.some((u) => passedUnits.has(u)) };
    }),
  };
  return [
    { path: "README.md", data: clip(map, MAP_MAX) },
    { path: "features.json", data: `${JSON.stringify(features, null, 2)}\n` },
  ];
}

// D-543: a model per role. A job may name another agent and model for its planner, its advisor and its writers (from
// the person's own models); a role without its own choice uses the job's agent and model.
export const JobRole = z.enum(["planner", "advisor", "writer"]);
export type JobRole = z.infer<typeof JobRole>;
const RoleChoice = z.object({ agent: z.string().trim().min(1).max(200), model: z.string().trim().min(1).max(200).nullable() }).strict();
export const JobRoles = z.object({ planner: RoleChoice.optional(), advisor: RoleChoice.optional(), writer: RoleChoice.optional() }).strict();
export type JobRoles = z.infer<typeof JobRoles>;

export function roleRoute(job: { agent: string; model: string | null }, roles: JobRoles | null, role: JobRole): { agent: string; model: string | null } {
  const r = roles?.[role];
  return r ? { agent: r.agent, model: r.model } : { agent: job.agent, model: job.model };
}
