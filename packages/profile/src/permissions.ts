import { Subject, ToolPattern } from "@mandat/contract";
import type { ToolRule } from "@mandat/contract";

// E8g (v5 p. 4.4, D-352): tool_permissions (subject × tool → decision) is the source of layer C. A change makes a new
// profile version (layer C only); opening something dangerous (to allow on net:* or bash:git push) needs a fresh TOTP.
export type Decision = ToolRule["decision"];
export interface PermissionRow { subject: string; tool: string; decision: Decision }

/** Rows override the same subject × tool in C (keeping its reason); unknown pairs are appended; invalid rows are dropped. */
export function applyPermissions(c: readonly ToolRule[], rows: readonly PermissionRow[]): ToolRule[] {
  const valid = rows.filter((r) => Subject.safeParse(r.subject).success && ToolPattern.safeParse(r.tool).success);
  const key = (r: { subject: string; tool: string }) => `${r.subject}\u0000${r.tool}`;
  const byKey = new Map(valid.map((r) => [key(r), r]));
  const out = c.map((r) => {
    const o = byKey.get(key(r));
    if (!o) return r;
    byKey.delete(key(r));
    return { ...r, decision: o.decision };
  });
  for (const r of byKey.values()) out.push({ subject: r.subject, tool: r.tool, decision: r.decision, reason: "tool_permissions" });
  return out;
}

/** A change TO allow on net:* or bash:git push (from anything else) opens a way out of the sandbox → TOTP. */
export function opensDangerous(tool: string, before: Decision | null, after: Decision): boolean {
  if (after !== "allow" || before === "allow") return false;
  return tool.startsWith("net:") || /^bash:git\s+push(\s|$)/.test(tool);
}

/** "Allow once": the granted ask rules become allow for one attempt (deny > ask > allow, so the ask must go). */
export function grantOnce(c: readonly ToolRule[], tools: readonly string[]): ToolRule[] {
  const g = new Set(tools);
  return c.map((r) => (r.decision === "ask" && g.has(r.tool) ? { ...r, decision: "allow" as const, reason: "allowed once by a person" } : r));
}

export interface Ask { tool: string; reason: string }
/**
 * asks.jsonl is written by the hook inside the sandbox, where the agent can write too: only asks that name an "ask"
 * rule of the compiled policy count, and the reason shown to a person comes from the policy, never from the file.
 */
export function parseAsks(text: string, policy: { rules: readonly { tool: string; decision: string; reason?: string }[] }): Ask[] {
  const askRules = new Map(policy.rules.filter((r) => r.decision === "ask").map((r) => [r.tool, r.reason ?? ""]));
  const out = new Map<string, Ask>();
  for (const line of text.split("\n")) {
    if (out.size >= 20) break;
    let j: unknown;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const tool = j !== null && typeof j === "object" && "tool" in j ? (j as { tool: unknown }).tool : undefined;
    if (typeof tool !== "string" || !askRules.has(tool) || out.has(tool)) continue;
    out.set(tool, { tool, reason: askRules.get(tool) ?? "" });
  }
  return [...out.values()];
}
