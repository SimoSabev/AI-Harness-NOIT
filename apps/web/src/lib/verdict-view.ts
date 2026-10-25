import { explain } from "@mandat/contract";
import { translate } from "../i18n/t";
import type { Lang } from "../i18n/t";

// F4 card: the verdict as sign + word + colour (WCAG 1.4.1), the tests line, the one primary action, the failure layer.
export type Tone = "verified" | "failed" | "unknown" | "working";
export function verdictView(result: string | null, lang: Lang = "en"): { sign: string; word: string; tone: Tone } {
  if (result === "VERIFIED") return { sign: "✔", word: translate(lang, "verdict.verified"), tone: "verified" };
  if (result === "FAILED") return { sign: "✖", word: translate(lang, "verdict.failed"), tone: "failed" };
  if (result === "UNKNOWN") return { sign: "?", word: translate(lang, "verdict.unknown"), tone: "unknown" };
  return { sign: "…", word: translate(lang, "verdict.working"), tone: "working" };
}

type Run = { passed: number; total: number } | null;
export function testsLine(t: { a: Run; b: Run; inventory: { before: number | null; after: number | null } | null }, lang: Lang = "en"): string {
  const parts: string[] = [];
  if (t.a) parts.push(`A ${t.a.passed}/${t.a.total}`);
  if (t.b) parts.push(`B ${t.b.passed}/${t.b.total}`);
  if (parts.length === 0) return translate(lang, "tests.none");
  const inv = t.inventory;
  const line = parts.join(" · ");
  return inv && inv.before !== null && inv.after !== null && inv.before !== inv.after ? `${line} (${inv.before} → ${inv.after})` : line;
}

export type Action = "approve" | "retry" | "open_pr" | "view";
export function actionLabel(a: Action, lang: Lang = "en"): string {
  return translate(lang, `action.${a}`);
}
export function primaryAction(t: { state: string; result: string | null; approval_needed: boolean; pr_number: number | null }): Action {
  if (t.state === "HELD" || (t.state === "GATED" && t.approval_needed)) return "approve";
  if (t.result === "FAILED" || t.state === "BLOCKED") return "retry";
  if (t.pr_number !== null && (t.state === "DELIVERED" || t.state === "OUTCOME" || t.state === "GATED")) return "open_pr";
  return "view";
}

export type Layer = "agent" | "verification" | "infra" | "policy";
export function layerLabel(l: Layer, lang: Lang = "en"): string {
  return translate(lang, `layer.${l}`);
}
/** Demo prompt §2.2 no. 10 (D-286): E0 D4/D1/MUST_PASS + D7 → verification; INFRA → infra; POLICY → policy; else agent. */
export function failureLayer(reasons: string[]): Layer | null {
  const first = reasons[0];
  if (!first) return null;
  const det = first.split(":")[0] ?? "";
  if (det === "INFRA") return "infra";
  if (det === "POLICY") return "policy";
  if (det === "D1" || det === "D4" || det === "MUST_PASS" || det.startsWith("D7")) return "verification";
  return "agent";
}

const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/**
 * One D-reason → the human sentence of the mandat_explain table (the verdict line itself is dropped). The <untrusted>
 * frame (T3-5) is for prompts; on the page the ID is shown as «text» and React escapes it.
 */
export function reasonText(reason: string, lang: Lang = "en"): string {
  const s = explain({ result: "-", reasons: [reason], lang }).split("\n").slice(1).join(" ");
  return s.replace(/<untrusted[^>]*>([\s\S]*?)<\/untrusted>/g, (_m, id: string) => `«${unescapeXml(id)}»`);
}

/** The tests line of a card row: A = D1.base_tests (passed/total); B = the inventory after the change against base. */
export function testsOf(t: { a_passed: number | null; a_total: number | null; inv_before: number | null; inv_after: number | null }, lang: Lang = "en"): string {
  const a = t.a_passed !== null && t.a_total !== null ? { passed: t.a_passed, total: t.a_total } : null;
  const b = t.inv_after !== null && t.inv_before !== null ? { passed: Math.min(t.inv_after, t.inv_before), total: t.inv_before } : null;
  return testsLine({ a, b, inventory: t.inv_before !== null || t.inv_after !== null ? { before: t.inv_before, after: t.inv_after } : null }, lang);
}
