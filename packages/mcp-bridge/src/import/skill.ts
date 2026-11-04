import { sha256Tag } from "@mandat/contract";
import type { Sha256 } from "@mandat/contract";
import { scanToolDefs } from "../vet.js";

// D-484: a skill from outside (a repo, a machine) is untrusted text that would reach the model as instructions. It is
// scanned with the same rules as an MCP tool description; a finding blocks it (with the reason), approval never unblocks it.
export interface SkillCandidate { name: string; description: string; content_hash: Sha256; text: string; origin: string; blocked_reason: string | null }

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MAX_SKILL = 64 * 1024;

function frontmatter(text: string): Record<string, string> | null {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m?.[1]) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv?.[1]) out[kv[1]] = (kv[2] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

export function parseSkill(text: string, origin: string, fallbackName = "skill"): SkillCandidate {
  const t = text.slice(0, MAX_SKILL);
  const fm = frontmatter(t);
  const name = (fm?.name ?? fallbackName).toLowerCase().slice(0, 64);
  const description = (fm?.description ?? "").slice(0, 200);
  const row = { name, description, content_hash: sha256Tag(t), text: t, origin };
  if (text.length > MAX_SKILL) return { ...row, blocked_reason: "too_large" };
  if (!fm) return { ...row, blocked_reason: "no_frontmatter" };
  if (!NAME.test(name)) return { ...row, blocked_reason: "bad_name" };
  const f = scanToolDefs([{ name, description: t }])[0];
  return { ...row, blocked_reason: f ? `${f.reason}: ${f.match}`.slice(0, 200) : null };
}
