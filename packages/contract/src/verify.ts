import { z } from "zod";
import { GitSha, OrgId, Sha256, TaskType, Verdict, VerifyMode } from "./schemas.js";
import type { VerdictResult } from "./schemas.js";

// Демо промпт т. 3.3 — the single core contract: base_sha + tree_sha + contract → verdict + level + record.
export const AgentKey = z.string().regex(/^(claude|codex|fake:[a-z0-9-]+|fake-codex:[a-z0-9-]+|external:gh:[0-9]{1,20}|external:mcp-local)$/);
export type AgentKey = z.infer<typeof AgentKey>;

export const VerifyRequest = z
  .object({
    mode: VerifyMode,
    org_id: OrgId,
    repo: z.object({ provider: z.enum(["local", "github"]), full_name: z.string().nullable(), path: z.string().nullable() }).strict(),
    base_sha: GitSha,
    tree_sha: GitSha,
    diff_hash: Sha256,
    task_type: TaskType.nullable(),
    agent: AgentKey,
    level_cap: z.number().int().min(0).max(3), // T3-6: the caller's cap
    requested_by: z.enum(["cli", "mcp", "github_observer", "worker"]),
  })
  .strict();
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const VerifyOutcome = z
  .object({
    verdict: Verdict,
    ladder_key: z.object({ repo: z.string(), task_type: z.string(), agent: AgentKey }).strict(),
    ladder_level: z.number().int().min(0).max(3),
    effective_level: z.number().int().min(0).max(3),
    level_reasons: z.array(z.string()),
    ledger: z.object({ from: z.number().int(), to: z.number().int() }).nullable(),
  })
  .strict();
export type VerifyOutcome = z.infer<typeof VerifyOutcome>;

export type Level = 0 | 1 | 2 | 3;
export type D7Status = "pass" | "fail" | "unknown" | "n/a";

/**
 * = min(ladder, riskCap, levelCap, UNKNOWN ? 1 : 3, external ? 1 : 3, rulesetStrict ? 3 : 1, d7 pass ? 3 : 1).
 * reasons: every constraint below the ladder level (it, not the ladder, limits the level).
 */
export function effectiveLevel(i: { ladder: number; riskCap: number; result: VerdictResult; mode: VerifyMode; levelCap: number; rulesetStrict: boolean; d7: D7Status }): { level: Level; reasons: string[] } {
  const caps: [string, number][] = [
    ["risk_cap", i.riskCap],
    ["parent_cap", i.levelCap],
    ["unknown", i.result === "UNKNOWN" ? 1 : 3],
    ["external_cap", i.mode === "external" ? 1 : 3],
    ["ruleset_missing", i.rulesetStrict ? 3 : 1],
    ["d7_missing", i.d7 === "pass" ? 3 : 1],
  ];
  const ladder = Math.max(0, Math.min(3, Math.trunc(i.ladder)));
  const level = Math.max(0, Math.min(ladder, ...caps.map(([, v]) => Math.max(0, Math.min(3, v))))) as Level;
  const reasons = caps.filter(([, v]) => v < ladder).map(([k]) => k);
  return { level, reasons };
}

export type UntrustedSource = "pr_title" | "pr_body" | "pr_comment" | "issue" | "webhook" | "test_id" | "path" | "branch" | "steer";

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeXml(s).replace(/"/g, "&quot;");

/** T3-5 / D-227: the only way external text may reach a prompt or a summary. */
export function frameUntrusted(t: { author: string; association: string; source: UntrustedSource; text: string }): string {
  return `<untrusted author="${escapeAttr(t.author)}" association="${escapeAttr(t.association)}" source="${t.source}">${escapeXml(t.text)}</untrusted>`;
}

// S15: tree identifiers in a check summary: code span, escaped ` and |, no control/bidi characters, ≤ 300 chars.
// eslint-disable-next-line no-control-regex -- stripping control characters is the point (S15)
const CONTROL = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏؜]/g;
export function codeSpan(id: string): string {
  const clean = id.replace(CONTROL, "").replace(/`/g, "'").replace(/\|/g, "\\|");
  const cut = clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
  return `\`${cut}\``;
}
