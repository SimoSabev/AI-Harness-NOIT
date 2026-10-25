import { plural, translate } from "../i18n/t";
import type { Lang } from "../i18n/t";
import { pageName } from "./brand";

// Demo prompt §8.1: the summary on top of the inbox for the last 24 h, and the counter in <title>.
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

export function summaryLine(s: Summary, lang: Lang = "en"): string {
  return translate(lang, "inbox.summary", { merged: s.autoMerged, failed: s.failed, waiting: plural(lang, "inbox.waitingYou", s.waiting) });
}

export function pageTitle(waiting: number, lang: Lang = "en"): string {
  return waiting > 0 ? pageName(plural(lang, "inbox.title", waiting)) : pageName(translate(lang, "inbox.title.none"));
}
