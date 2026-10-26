import { sha256Tag } from "@mandat/contract";
import type { SkillRef } from "@mandat/contract";
import { RESEARCH_SKILL } from "./research-skill.js";

// E8e (v5 p. 4.5 (5), D-354): the harness's own skills. The profile names a skill by content hash; the run materializes
// only texts whose hash matches (a repo skill that changed since approval is left out and listed).
export const BUILTIN_SKILLS = {
  "test-first": {
    description: "Write the failing test first, then the smallest change that makes it pass.",
    text: "---\nname: test-first\ndescription: Write the failing test first, then the smallest change that makes it pass.\n---\n1. Reproduce the problem with a test that fails for the right reason.\n2. Make the smallest change in the source that turns it green.\n3. Run the whole suite; never delete or weaken an existing test.\n",
  },
  review: {
    description: "Read the change as a reviewer: correctness, tests, scope.",
    text: "---\nname: review\ndescription: Read the change as a reviewer: correctness, tests, scope.\n---\nCheck that every changed line is needed for the task, that a test covers it, and that nothing outside the allowed paths changed. Report problems; do not rewrite the change.\n",
  },
  // E9г (D-401): the research process with the research_* tools
  research: {
    description: "Find facts with checked sources through Mandat's research tools (research_*), never from memory.",
    text: RESEARCH_SKILL,
  },
} as const;
export type BuiltinSkill = keyof typeof BUILTIN_SKILLS;

export function builtinSkillRef(name: BuiltinSkill): SkillRef {
  const s = BUILTIN_SKILLS[name];
  return { name, source: "builtin", content_hash: sha256Tag(s.text), description: s.description };
}

/** The texts the compiler may write: builtin by name, others from `available` (e.g. the repo) only when the hash matches. */
export function skillTexts(refs: readonly SkillRef[], available: Readonly<Record<string, string>>): { texts: Record<string, string>; dropped: { rule: string; why: string }[] } {
  const texts: Record<string, string> = {};
  const dropped: { rule: string; why: string }[] = [];
  for (const r of refs) {
    const text = r.source === "builtin" && r.name in BUILTIN_SKILLS ? BUILTIN_SKILLS[r.name as BuiltinSkill].text : available[r.name];
    if (text !== undefined && sha256Tag(text) === r.content_hash) texts[r.name] = text;
    else dropped.push({ rule: `skill:${r.name}`, why: r.source === "repo" ? "the repo's skill changed since the profile was approved (hash)" : "the skill text is not available (hash)" });
  }
  return { texts, dropped };
}
