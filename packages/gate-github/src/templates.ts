import { codeSpan } from "@mandat/contract";
import type { Verdict } from "@mandat/contract";

// E8g (v5 p. 4.7 (1)–(2), AC-9.1, D-356): the delivery texts are deterministic templates. One squash commit per attempt:
// `<type>: <task title>` (≤ 72), the checks that passed, trailers; Co-Authored-By only when the project asks. The PR body:
// task, change per file, tests before → after, verdict, level, the card. Paths go in code spans; the task text is escaped.
const TYPE: Record<string, string> = { bugfix: "fix", feature: "feat", css: "style", docs: "docs" };
// eslint-disable-next-line no-control-regex -- stripping control and bidi characters is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩؜]/g;

const firstLine = (text: string) => (text.split("\n")[0] ?? "").replace(CONTROL, "").replace(/\s+/g, " ").trim();
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const escape = (s: string) => s.replace(CONTROL, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function prTitle(o: { type: string; text: string }): string {
  return cut(`${TYPE[o.type] ?? "chore"}: ${firstLine(o.text)}`, 72);
}

export function commitMessage(o: { type: string; text: string; taskId: string; verdict: Verdict; ledgerSeq: number | null; coAuthors?: readonly string[] }): string {
  const passed = o.verdict.evidence.filter((e) => e.status === "pass").map((e) => e.detector);
  const lines = [prTitle(o), "", `Checked: ${passed.join(", ") || "-"}`, "", `Mandat-Verdict: ${o.verdict.result} seq ${o.ledgerSeq ?? "-"}`, `Mandat-Task: ${o.taskId}`];
  for (const a of o.coAuthors ?? []) lines.push(`Co-Authored-By: ${a.replace(CONTROL, "").slice(0, 200)}`);
  return lines.join("\n");
}

export interface FileStat { path: string; added: number; removed: number }
/** Per file from a unified git diff (the export's diff.patch). */
export function diffStats(diff: Buffer): FileStat[] {
  const out: FileStat[] = [];
  let cur: FileStat | null = null;
  let inHunk = false;
  for (const l of diff.toString("utf8").split("\n")) {
    if (l.startsWith("diff --git ")) {
      cur = { path: "", added: 0, removed: 0 };
      out.push(cur);
      inHunk = false;
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(l);
      if (m?.[2]) cur.path = m[2];
      continue;
    }
    if (!cur) continue;
    if (!inHunk && l.startsWith("+++ ")) {
      if (l !== "+++ /dev/null") cur.path = l.slice(4).replace(/^b\//, "");
      continue;
    }
    if (!inHunk && l.startsWith("--- ")) continue;
    if (l.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (inHunk && l.startsWith("+")) cur.added++;
    else if (inHunk && l.startsWith("-")) cur.removed++;
  }
  return out.filter((f) => f.path !== "");
}

export function prBody(o: { text: string; taskId: string; diff: Buffer; verdict: Verdict; level: number; ledgerSeq: number | null; cardUrl: string | null }): string {
  const files = diffStats(o.diff);
  const d2 = o.verdict.evidence.find((e) => e.detector === "D2.inventory");
  const lines = [
    `**Task** \`${o.taskId}\`: ${escape(firstLine(o.text)).slice(0, 300)}`,
    "",
    "| File | + | − |",
    "| --- | ---: | ---: |",
    ...files.slice(0, 100).map((f) => `| ${codeSpan(f.path)} | ${f.added} | ${f.removed} |`),
    ...(files.length > 100 ? [`| … ${files.length - 100} more | | |`] : []),
    "",
    `**Tests (before → after):** ${d2 ? escape(d2.summary).slice(0, 120) : "-"}`,
    `**Verdict:** ${o.verdict.result}${o.verdict.reasons.length ? ` — ${o.verdict.reasons.slice(0, 5).map((r) => codeSpan(r)).join(", ")}` : ""} · level ${o.level} · ledger seq ${o.ledgerSeq ?? "-"}`,
    ...(o.cardUrl ? [`**Card:** ${o.cardUrl}`] : []),
    "",
    "_Written by Mandat from the verdict; no model wrote this text._",
  ];
  return lines.join("\n");
}
