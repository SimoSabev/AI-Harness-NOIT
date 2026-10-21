import { pageName } from "./brand";

// Демо промпт т. 8.1: the summary on top of the inbox for the last 24 h, and the counter in <title>.
export type SummaryRow = { result: string | null; delivered: string | null; approved_by_human: boolean; decided_at: string | null; waiting: boolean };
export type Summary = { autoMerged: number; failed: number; waiting: number };

export function inboxSummary(rows: SummaryRow[], now: Date = new Date()): Summary {
  const since = now.getTime() - 24 * 3600_000;
  const recent = (r: SummaryRow) => r.decided_at !== null && Date.parse(r.decided_at) >= since;
  return {
    autoMerged: rows.filter((r) => recent(r) && r.result === "VERIFIED" && r.delivered === "merge" && !r.approved_by_human).length,
    failed: rows.filter((r) => recent(r) && r.result === "FAILED").length,
    waiting: rows.filter((r) => r.waiting).length,
  };
}

const waits = (n: number) => (n === 1 ? "чака" : "чакат");

export function summaryLine(s: Summary): string {
  return `${s.autoMerged} ПРОВЕРЕНО и слети сами · ${s.failed} ПРОВАЛ · ${s.waiting} ${waits(s.waiting)} теб`;
}

export function pageTitle(waiting: number): string {
  return waiting > 0 ? pageName(`${waiting} ${waits(waiting)}`) : pageName("Задачи");
}
