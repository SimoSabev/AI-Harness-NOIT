import type { MemoryItem } from "@mandat/contract";
import { line, renderCore } from "./core.js";
import { estimateTokens } from "./text.js";

// D-392: what memory costs. "all" is what putting every active memory into the context would take (full replay, never
// economical — arXiv 2609.05441); "core" is what Mandat puts in; the rest comes only when a task or a search needs it.

export function memoryTokens(items: readonly MemoryItem[], repoId: string | null): { active: number; all: number; core: number } {
  const active = items.filter((m) => m.status === "active" && m.scope !== "session");
  const c = renderCore(items, repoId);
  return { active: active.length, all: active.reduce((s, m) => s + estimateTokens(line(m)), 0), core: c.tokens.user + c.tokens.project };
}

export interface UsageSummary { runs: number; avg: number; max: number; saved_pct: number }

/** Per task: the core plus the recall it got; saved_pct is against putting all active memory into every task. */
export function usageSummary(rows: readonly { core_tokens: number; recall_tokens: number }[], allTokens: number): UsageSummary {
  if (rows.length === 0) return { runs: 0, avg: 0, max: 0, saved_pct: 0 };
  const per = rows.map((r) => r.core_tokens + r.recall_tokens);
  const avg = Math.round(per.reduce((s, x) => s + x, 0) / per.length);
  return { runs: rows.length, avg, max: Math.max(...per), saved_pct: allTokens > avg ? Math.round(((allTokens - avg) / allTokens) * 100) : 0 };
}
