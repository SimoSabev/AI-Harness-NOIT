import { MEMORY_BUDGET, hashJcs, sha256Tag } from "@mandat/contract";
import type { MemoryItem, MemoryKind, Sha256 } from "@mandat/contract";
import { estimateTokens } from "./text.js";

// D-400: the frozen core — what is always in the context. Small, hard-capped and in a stable order, so it is the same
// text for the whole session (prefix cache) and its hash goes to the ledger.

const KIND_ORDER: readonly MemoryKind[] = ["preference", "convention", "command", "pitfall", "fact", "note", "episode"];

/** The order of the core: pinned, by kind, more used, older, id. */
export function coreOrder(a: MemoryItem, b: MemoryItem): number {
  return Number(b.pinned) - Number(a.pinned) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.uses - a.uses || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export const line = (m: Pick<MemoryItem, "text">): string => `- ${m.text.replace(/\s+/g, " ")}\n`;

export interface Core {
  user: MemoryItem[];
  project: MemoryItem[];
  /** active core memories that did not fit the budget */
  dropped: MemoryItem[];
  tokens: { user: number; project: number };
  /** what all active core memories would take, in % of the budget (over 100 = something is dropped) */
  fill: { user: number; project: number };
  hash: Sha256;
}

function fit(items: MemoryItem[], budget: number): { kept: MemoryItem[]; dropped: MemoryItem[]; tokens: number; all: number } {
  const kept: MemoryItem[] = [];
  const dropped: MemoryItem[] = [];
  let tokens = 0;
  let all = 0;
  for (const m of [...items].sort(coreOrder)) {
    const t = estimateTokens(line(m));
    all += t;
    if (tokens + t <= budget) {
      kept.push(m);
      tokens += t;
    } else dropped.push(m);
  }
  return { kept, dropped, tokens, all };
}

/** The core for a repo (null: no project part). Only active memories; session notes are never in the core. */
export function renderCore(items: readonly MemoryItem[], repoId: string | null, budget: { user: number; project: number } = MEMORY_BUDGET): Core {
  const active = items.filter((m) => m.status === "active");
  const u = fit(active.filter((m) => m.scope === "user"), budget.user);
  const p = fit(repoId === null ? [] : active.filter((m) => m.scope === "project" && m.repo_id === repoId), budget.project);
  const pct = (all: number, b: number) => (b === 0 ? 0 : Math.round((all / b) * 100));
  return {
    user: u.kept, project: p.kept, dropped: [...u.dropped, ...p.dropped],
    tokens: { user: u.tokens, project: p.tokens },
    fill: { user: pct(u.all, budget.user), project: pct(p.all, budget.project) },
    hash: hashJcs({ user: u.kept.map((m) => [m.id, m.text]), project: p.kept.map((m) => [m.id, m.text]) }),
  };
}

export interface MemoryBlock {
  text: string;
  tokens: number;
  /** sha256 of the text: the contract's memory_hash and the ledger's memory_snapshot */
  hash: Sha256;
  core: string[];
  recall: string[];
}

/** The block an agent gets: the core, then the recall picked for its task (without what the core already has). */
export function memoryBlock(core: Core, recall: readonly MemoryItem[]): MemoryBlock | null {
  const inCore = new Set([...core.user, ...core.project].map((m) => m.id));
  const extra = recall.filter((m) => !inCore.has(m.id));
  const parts: string[] = [];
  if (core.user.length > 0) parts.push("About the person:\n", ...core.user.map(line));
  if (core.project.length > 0) parts.push("About this project:\n", ...core.project.map(line));
  if (extra.length > 0) parts.push("Relevant to this task:\n", ...extra.map(line));
  if (parts.length === 0) return null;
  const text = parts.join("");
  return { text, tokens: estimateTokens(text), hash: sha256Tag(text), core: [...inCore], recall: extra.map((m) => m.id) };
}
