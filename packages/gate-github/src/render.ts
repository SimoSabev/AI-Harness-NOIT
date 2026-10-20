import { codeSpan } from "@mandat/contract";
import type { Verdict, VerifyMode } from "@mandat/contract";
import type { CheckConclusion } from "./port.js";

// Демо промпт т. 6.2 (D-209): deterministic, no LLM, no text from the PR. neutral is never used.
export const SUMMARY_MAX = 65535;
const SIGN: Record<string, string> = { VERIFIED: "✅", FAILED: "❌", UNKNOWN: "⚠️" };
const cell = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");

export function conclusionOf(result: Verdict["result"]): CheckConclusion {
  return result === "VERIFIED" ? "success" : result === "FAILED" ? "failure" : "action_required";
}

export function renderCheck(v: Verdict, o: { effectiveLevel: number; levelReasons?: string[]; mode: VerifyMode; ledgerSeq: number | null; appUrl?: string | null; taskId?: string }): {
  conclusion: CheckConclusion;
  title: string;
  summary: string;
  details_url?: string;
} {
  const conclusion = conclusionOf(v.result);
  const first = v.reasons[0] ?? "-";
  const title = v.result === "UNKNOWN" ? `UNKNOWN: ${first}`.slice(0, 200) : v.result === "FAILED" ? `FAILED: ${first}`.slice(0, 200) : "VERIFIED";
  const lines: string[] = [];
  lines.push(`**${SIGN[v.result] ?? ""} ${v.result}**${o.mode === "external" ? " (external)" : ""}`, "");
  lines.push("| detector | status | summary |", "| --- | --- | --- |");
  for (const e of v.evidence) {
    // Detector summaries can quote tree identifiers (test IDs, paths): code spans only (S15).
    lines.push(`| ${e.detector} | ${e.status} | ${e.signature ? codeSpan(e.signature) : cell(e.summary).slice(0, 200)} |`);
  }
  lines.push("");
  if (v.reasons.length > 0) {
    lines.push("**reasons**");
    for (const r of v.reasons.slice(0, 20)) lines.push(`- ${codeSpan(r)}`);
    if (v.reasons.length > 20) lines.push(`- … още ${v.reasons.length - 20}`);
    lines.push("");
  }
  lines.push(`ниво: ${o.effectiveLevel}${o.levelReasons && o.levelReasons.length ? ` (причини: ${o.levelReasons.join(", ")})` : ""}`);
  if (o.ledgerSeq !== null) lines.push(`ред в дневника: seq ${o.ledgerSeq}`);
  const url = o.appUrl && o.taskId ? `${o.appUrl.replace(/\/+$/, "")}/tasks/${encodeURIComponent(o.taskId)}` : undefined;
  if (url) lines.push(`[карта](${url})`);
  let summary = lines.join("\n");
  if (summary.length > SUMMARY_MAX) summary = summary.slice(0, SUMMARY_MAX - 2) + "\n…";
  return { conclusion, title, summary, ...(url ? { details_url: url } : {}) };
}

/** One line for logs/CLI: "Мандат verdict: failure — FAILED · D7.ci pass · D2.inventory fail (20 → 19)". */
export function checkLine(v: Verdict): string {
  // CI first: the scene is „CI зелено → Мандат FAILED“ (т. 6 „Готово, когато“)
  const show = [...v.evidence.filter((e) => e.detector === "D7.ci"), ...v.evidence.filter((e) => e.detector !== "D7.ci" && (e.status === "fail" || e.status === "unknown"))];
  const parts = show.map((e) => {
    const d = e.data as { before?: number; after?: number };
    const counts = e.detector === "D2.inventory" && typeof d.before === "number" && typeof d.after === "number" ? ` (${d.before} → ${d.after})` : "";
    return `${e.detector} ${e.status}${counts}`;
  });
  return `Мандат verdict: ${conclusionOf(v.result)} — ${[v.result, ...parts].join(" · ")}`;
}
