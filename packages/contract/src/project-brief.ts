import { z } from "zod";
import { hashJcs } from "./hash.js";
import type { Sha256 } from "./schemas.js";

// D-557 (demo 4.12, docs/prd/demo-2026-12-04.md §3): when a project is added, the harness interviews the person about
// the whole project before any task: what it is, who uses it, what already works and must not break, how it is built
// and tested, who approves and the spending cap. The model reads the project and proposes this brief; only a person
// approves it (its hash); later task conversations of the project start from it, so they ask less.

const Line = z.string().trim().min(1).max(300);
const Command = z.string().trim().min(1).max(200);

export const ProjectBrief = z
  .object({
    product: z.string().trim().min(1).max(2000),
    users: z.array(Line).max(10),
    works_today: z.array(Line).max(30),
    must_not_break: z.array(Line).max(30),
    commands: z.object({ install: Command.optional(), build: Command.optional(), test: Command.optional(), dev: Command.optional() }).strict(),
    stack: z.array(Line).max(20),
    approver: Line,
    /** the cap per job, in USD */
    budget_usd: z.number().min(0).max(10_000),
    notes: z.array(Line).max(20),
  })
  .strict();
export type ProjectBrief = z.infer<typeof ProjectBrief>;

export const projectBriefHash = (b: ProjectBrief): Sha256 => hashJcs(b);

/** D-599: some parts of the brief, as the model learned them during the interview (the screen writes the brief live) */
export const ProjectBriefParts = ProjectBrief.partial().refine((p) => Object.keys(p).length > 0, "a note names at least one part");
export type ProjectBriefParts = z.infer<typeof ProjectBriefParts>;
/** D-599: a note of the model: the parts it just learned and where from — the project's code or the person's answer */
export const ProjectNote = z.object({ from: z.enum(["code", "person"]), parts: ProjectBriefParts }).strict();
export type ProjectNote = z.infer<typeof ProjectNote>;

/** what a brief still lacks before a person can approve it (deterministic; vague wording is the interview's job) */
export function projectBriefMissing(b: ProjectBrief): string[] {
  const out: string[] = [];
  if (b.users.length === 0) out.push("users");
  if (b.works_today.length === 0) out.push("works_today");
  if (!b.commands.test) out.push("commands.test");
  return out;
}

export const PROJECT_BRIEF_TEXT_MAX = 3000;

/** the brief as text for a model's context (a task conversation, the planner) */
export function projectBriefText(b: ProjectBrief): string {
  const list = (xs: readonly string[]) => (xs.length > 0 ? xs.join("; ") : "-");
  const cmd = (name: string, c: string | undefined) => (c ? [`${name}: ${c}`] : []);
  return [
    `Product: ${b.product}`,
    `Users: ${list(b.users)}`,
    `Works today: ${list(b.works_today)}`,
    `Must not break: ${list(b.must_not_break)}`,
    ...cmd("Install", b.commands.install),
    ...cmd("Build", b.commands.build),
    ...cmd("Tests", b.commands.test),
    ...cmd("Dev server", b.commands.dev),
    `Stack: ${list(b.stack)}`,
    `Approver: ${b.approver}; cap per job: ${b.budget_usd} USD`,
    `Notes: ${list(b.notes)}`,
  ]
    .join("\n")
    .slice(0, PROJECT_BRIEF_TEXT_MAX);
}

/** POST /api/conversations/:id/approve-project: a person approves the brief with this hash */
export const ProjectApproveBody = z.object({ brief_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict();
export type ProjectApproveBody = z.infer<typeof ProjectApproveBody>;
