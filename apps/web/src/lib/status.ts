import { LOCALE, translate } from "../i18n/t";
import type { Key, Lang } from "../i18n/t";

// D-292: what the person sees — one status word + one sentence per task, never the internal state names.
export type StatusKey = "queued" | "running" | "checking" | "review" | "failed" | "unknown" | "empty" | "key" | "stopped" | "approved" | "closed";
export type Tone = "gray" | "blue" | "green" | "red" | "amber";
export interface Status { key: StatusKey; label: string; tone: Tone; headline: string }

const TONES: Record<StatusKey, Tone> = {
  queued: "gray", running: "blue", checking: "blue", review: "green", failed: "red", unknown: "amber", empty: "amber", key: "red", stopped: "gray", approved: "green", closed: "gray",
};

const RUNNING = new Set(["PROVISIONING", "RUNNING", "EXPORTING", "RETRY"]);
const CHECKING = new Set(["VERIFY_1", "REBASING", "PUSHED", "VERIFY_2", "VERDICT"]);

export function statusOf(t: { state: string; last_result: string | null; wait_reason: string | null; approval_needed: boolean; approved_by_human: boolean }, lang: Lang = "en"): Status {
  const k = keyOf(t);
  return { key: k, label: translate(lang, `status.${k}.label`), tone: TONES[k], headline: translate(lang, `status.${k}.headline`) };
}

function keyOf(t: { state: string; last_result: string | null; wait_reason: string | null; approval_needed: boolean; approved_by_human: boolean }): StatusKey {
  if (t.state === "CREATED" || t.state === "CONTRACTED") return "queued";
  if (RUNNING.has(t.state)) return "running";
  if (CHECKING.has(t.state)) return "checking";
  if (t.state === "BLOCKED" && t.wait_reason === "stopped") return "stopped";
  if (t.last_result === "FAILED" || t.state === "BLOCKED") return "failed";
  if (t.approved_by_human && t.last_result === "VERIFIED") return "approved";
  if (t.state === "HELD" && t.wait_reason === "key_rejected") return "key";
  if (t.state === "HELD" && t.wait_reason === "empty_change") return "empty";
  if (t.last_result === "UNKNOWN" && (t.state === "HELD" || t.state === "GATED")) return "unknown";
  if (t.state === "HELD" || (t.state === "GATED" && t.approval_needed)) return "review";
  if (t.state === "GATED") return "checking";
  if (t.approved_by_human) return "approved";
  return "closed";
}

export type Group = "waiting" | "active" | "done";
export function groupTitle(g: Group, lang: Lang = "en"): string {
  return translate(lang, `group.${g}`);
}
export function groupOf(k: StatusKey): Group {
  if (k === "review" || k === "failed" || k === "unknown" || k === "empty" || k === "key") return "waiting";
  if (k === "queued" || k === "running" || k === "checking") return "active";
  return "done";
}

/** The checks of a verdict in plain words (the detector id stays visible small, for the curious). */
export const CHECK_LABEL: Record<string, Key> = {
  "D1.base_tests": "check.D1.base_tests",
  "D2.inventory": "check.D2.inventory",
  "D3.protected": "check.D3.protected",
  "D4.contract": "check.D4.contract",
  "D10.lockfile": "check.D10.lockfile",
  MUST_PASS: "check.MUST_PASS",
  EXPORT: "check.EXPORT",
  INTEGRITY: "check.INTEGRITY",
  CANARY: "check.CANARY",
  "D11.mutation": "check.D11.mutation",
};
export function checkLabel(detector: string, lang: Lang = "en"): string {
  const k = CHECK_LABEL[detector];
  if (k) return translate(lang, k);
  if (detector.startsWith("D7")) return translate(lang, "check.D7");
  return detector;
}

export function ago(iso: string, now: Date = new Date(), lang: Lang = "en"): string {
  const s = Math.round((Date.parse(iso) - now.getTime()) / 1000);
  const f = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return f.format(s, "second");
  if (a < 3600) return f.format(Math.round(s / 60), "minute");
  if (a < 86400) return f.format(Math.round(s / 3600), "hour");
  return f.format(Math.round(s / 86400), "day");
}
