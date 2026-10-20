import { explain } from "@mandat/contract";

// Ф4 card: the verdict as sign + word + colour (WCAG 1.4.1), the tests line, the one primary action, the failure layer.
export type Tone = "verified" | "failed" | "unknown" | "working";
export function verdictView(result: string | null): { sign: string; word: string; tone: Tone } {
  if (result === "VERIFIED") return { sign: "✔", word: "ПРОВЕРЕНО", tone: "verified" };
  if (result === "FAILED") return { sign: "✖", word: "ПРОВАЛ", tone: "failed" };
  if (result === "UNKNOWN") return { sign: "?", word: "НЕИЗВЕСТНО", tone: "unknown" };
  return { sign: "…", word: "РАБОТИ", tone: "working" };
}

type Run = { passed: number; total: number } | null;
export function testsLine(t: { a: Run; b: Run; inventory: { before: number | null; after: number | null } | null }): string {
  const parts: string[] = [];
  if (t.a) parts.push(`A ${t.a.passed}/${t.a.total}`);
  if (t.b) parts.push(`B ${t.b.passed}/${t.b.total}`);
  if (parts.length === 0) return "тестове: няма данни";
  const inv = t.inventory;
  const line = parts.join(" · ");
  return inv && inv.before !== null && inv.after !== null && inv.before !== inv.after ? `${line} (${inv.before} → ${inv.after})` : line;
}

export type Action = "approve" | "retry" | "open_pr" | "view";
export const ACTION_LABEL: Record<Action, string> = { approve: "Одобри", retry: "Повтори", open_pr: "Отвори PR", view: "Виж" };
export function primaryAction(t: { state: string; result: string | null; approval_needed: boolean; pr_number: number | null }): Action {
  if (t.state === "HELD" || (t.state === "GATED" && t.approval_needed)) return "approve";
  if (t.result === "FAILED" || t.state === "BLOCKED") return "retry";
  if (t.pr_number !== null && (t.state === "DELIVERED" || t.state === "OUTCOME" || t.state === "GATED")) return "open_pr";
  return "view";
}

export type Layer = "agent" | "verification" | "infra" | "policy";
export const LAYER_LABEL: Record<Layer, string> = { agent: "агент", verification: "проверка", infra: "инфраструктура", policy: "политика" };
/** Демо промпт т. 2.2 №10 (D-286): E0 D4/D1/MUST_PASS + D7 → verification; INFRA → infra; POLICY → policy; else agent. */
export function failureLayer(reasons: string[]): Layer | null {
  const first = reasons[0];
  if (!first) return null;
  const det = first.split(":")[0] ?? "";
  if (det === "INFRA") return "infra";
  if (det === "POLICY") return "policy";
  if (det === "D1" || det === "D4" || det === "MUST_PASS" || det.startsWith("D7")) return "verification";
  return "agent";
}

/** One D-reason → the human sentence of the mandat_explain table (the verdict line itself is dropped). */
export function reasonText(reason: string): string {
  return explain({ result: "-", reasons: [reason], lang: "bg" }).split("\n").slice(1).join(" ");
}

/** The tests line of a card row: A = D1.base_tests (passed/total); B = the inventory after the change against base. */
export function testsOf(t: { a_passed: number | null; a_total: number | null; inv_before: number | null; inv_after: number | null }): string {
  const a = t.a_passed !== null && t.a_total !== null ? { passed: t.a_passed, total: t.a_total } : null;
  const b = t.inv_after !== null && t.inv_before !== null ? { passed: Math.min(t.inv_after, t.inv_before), total: t.inv_before } : null;
  return testsLine({ a, b, inventory: t.inv_before !== null || t.inv_after !== null ? { before: t.inv_before, after: t.inv_after } : null });
}
