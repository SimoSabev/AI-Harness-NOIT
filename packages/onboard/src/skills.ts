import { sha256Tag } from "@mandat/contract";
import { findInvisible } from "./invisible.js";
import { dirView } from "./scan.js";
import type { RepoView } from "./scan.js";

// E8e (v5 p. 4.5 (5), AC-5.7, D-354): the repo's own skills (.claude/skills/<name>/SKILL.md, .agents/skills/<name>/SKILL.md).
// They are text that reaches the model: any invisible character blocks the skill; the hash pins what was approved.
export interface RepoSkill { name: string; path: string; description: string; content_hash: string; blocked: string | null; text: string }
const SKILL = /^(\.claude|\.agents)\/skills\/([a-z0-9][a-z0-9-]{0,63})\/SKILL\.md$/;
const MAX = 65_536;

function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const out: Record<string, string> = {};
  for (const l of (m?.[1] ?? "").split("\n")) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(l.trim());
    if (kv?.[1]) out[kv[1]] = (kv[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return out;
}

export function skillsFromView(v: RepoView): RepoSkill[] {
  const out: RepoSkill[] = [];
  for (const rel of [...v.files].sort()) {
    const m = SKILL.exec(rel);
    if (!m) continue;
    const text = v.read(rel);
    if (text === null || text.length > MAX) continue;
    const fm = frontmatter(text);
    const inv = findInvisible(text)[0];
    out.push({ name: fm.name && /^[a-z0-9][a-z0-9-]{0,63}$/.test(fm.name) ? fm.name : (m[2] as string), path: rel, description: (fm.description ?? "").slice(0, 200), content_hash: sha256Tag(text), blocked: inv ? `invisible character ${inv.codepoint}` : null, text });
    if (out.length >= 60) break;
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function scanSkills(root: string): RepoSkill[] {
  return skillsFromView(dirView(root));
}
