import { agentFailedCause } from "@mandat/contract";
import type { ProviderNotice, RunPhase } from "@mandat/contract";
import { LOCALE, translate } from "../i18n/t";
import type { Key, Lang } from "../i18n/t";

// D-292: what the person sees — one status word + one sentence per task, never the internal state names.
export type StatusKey = "queued" | "running" | "checking" | "review" | "failed" | "unknown" | "empty" | "agent" | "answered" | "key" | "stopped" | "approved" | "applied" | "closed" | "expired" | "ask" | "base" | "ci" | "limit";
export type Tone = "gray" | "blue" | "green" | "red" | "amber";
export interface Status { key: StatusKey; label: string; tone: Tone; headline: string }

// D-386: what waits for the person is amber (or red when it failed) — never green like a finished task.
const TONES: Record<StatusKey, Tone> = {
  queued: "gray", running: "blue", checking: "blue", review: "amber", failed: "red", unknown: "amber", empty: "amber", agent: "red", answered: "gray", key: "red", stopped: "gray", approved: "green", applied: "green", closed: "gray", expired: "gray", ask: "amber", base: "amber", ci: "red", limit: "blue",
};

const RUNNING = new Set(["PROVISIONING", "RUNNING", "EXPORTING", "RETRY"]);
const CHECKING = new Set(["VERIFY_1", "REBASING", "PUSHED", "VERIFY_2", "VERDICT"]);

type StatusInput = { state: string; last_result: string | null; wait_reason: string | null; approval_needed: boolean; approved_by_human: boolean; delivered?: string | null;
  /** D-627: when the subscription's limit resets (the last channel_limit of the task), if the provider said it */
  limit_resets_at?: string | null };
export function statusOf(t: StatusInput, lang: Lang = "en"): Status {
  const k = keyOf(t);
  // D-627: the reset time in the sentence, in the person's own clock
  const reset = k === "limit" && t.limit_resets_at ? new Date(t.limit_resets_at) : null;
  const headline = reset && !Number.isNaN(reset.getTime())
    ? translate(lang, "status.limit.headlineAt", { when: reset.toLocaleTimeString(LOCALE[lang], { hour: "2-digit", minute: "2-digit" }) })
    : translate(lang, `status.${k}.headline`);
  return { key: k, label: translate(lang, `status.${k}.label`), tone: TONES[k], headline };
}

function keyOf(t: StatusInput): StatusKey {
  if (t.state === "CREATED" || t.state === "CONTRACTED") return "queued";
  // D-627, D-607: the worker waits out the subscription's limit and runs it again by itself
  if (t.state === "HELD" && t.wait_reason === "channel_limit") return "limit";
  if (RUNNING.has(t.state)) return "running";
  if (CHECKING.has(t.state)) return "checking";
  if (t.state === "BLOCKED" && t.wait_reason === "stopped") return "stopped";
  if (t.state === "CLOSED" && t.wait_reason === "expired") return "expired";
  if (t.state === "CLOSED" && t.wait_reason === "answered") return "answered";
  if (t.last_result === "FAILED" || t.state === "BLOCKED") return "failed";
  if (t.approved_by_human && t.last_result === "VERIFIED") return "approved";
  if (t.state === "HELD" && t.wait_reason === "tool_approval") return "ask";
  if (t.state === "HELD" && t.wait_reason === "base_moved") return "base";
  if (t.state === "HELD" && t.wait_reason === "ci_failed") return "ci";
  if (t.state === "HELD" && t.wait_reason === "key_rejected") return "key";
  if (t.state === "HELD" && t.wait_reason === "empty_change") return "empty";
  if (t.state === "HELD" && t.wait_reason?.startsWith("agent_failed:")) return "agent";
  if (t.last_result === "UNKNOWN" && (t.state === "HELD" || t.state === "GATED")) return "unknown";
  if (t.state === "HELD" || (t.state === "GATED" && t.approval_needed)) return "review";
  if (t.state === "GATED") return "checking";
  if (t.approved_by_human) return "approved";
  // D-367: verified, safe, and gone into main by itself
  if (t.state === "CLOSED" && t.delivered === "merge" && t.last_result === "VERIFIED") return "applied";
  return "closed";
}

/** D-386: the box with the outcome takes the colour of the verdict; before a verdict, the colour of the status. */
export function outcomeTone(result: string | null, status: Tone): Tone {
  return result === "VERIFIED" ? "green" : result === "FAILED" ? "red" : result === "UNKNOWN" ? "amber" : status;
}

/** D-386: what the person can do in each status. `note` = a note to the agent that starts a new attempt with it. */
export interface Actions { decide: boolean; again: boolean; note: boolean; fixCi: boolean; stop: boolean; /** D-628 */ switchAccount: boolean }
export function actionsOf(k: StatusKey): Actions {
  const again = k === "failed" || k === "unknown" || k === "empty" || k === "agent" || k === "key" || k === "base";
  return { decide: k === "review", again, note: k === "review" || k === "ci" || (again && k !== "key"), fixCi: k === "ci", stop: k === "queued" || k === "running" || k === "checking", switchAccount: k === "limit" };
}

export type Group = "waiting" | "active" | "done";
export function groupTitle(g: Group, lang: Lang = "en"): string {
  return translate(lang, `group.${g}`);
}
export function groupOf(k: StatusKey): Group {
  if (k === "review" || k === "failed" || k === "unknown" || k === "empty" || k === "agent" || k === "key" || k === "ask" || k === "base" || k === "ci") return "waiting";
  if (k === "queued" || k === "running" || k === "checking" || k === "limit") return "active";
  return "done";
}

/** D-446: who a provider problem is about. Only an agent that always talks to one provider can name it. */
function providerWho(agent: string, lang: Lang): string {
  return translate(lang, agent === "gemini" || agent.startsWith("gemini+") ? "provider.who.google" : "provider.who.generic");
}
/** D-446: the phase of a run, in plain words. */
export function phaseLine(p: RunPhase, lang: Lang = "en"): string {
  return translate(lang, `ws.phase.${p}`);
}
/** D-446: a provider problem as fixed text: typed codes in, a catalog sentence out, never a CLI's words. */
export function noticeLine(n: ProviderNotice, agent: string, lang: Lang = "en"): string {
  const who = providerWho(agent, lang);
  if (n.attempt !== null && n.max !== null && n.attempt >= n.max) return translate(lang, "provider.live.last", { who, n: n.attempt });
  const text = translate(lang, `provider.live.${n.problem}`, { who });
  if (n.attempt === null) return text;
  return n.max === null ? translate(lang, "provider.live.attemptOnly", { text, n: n.attempt }) : translate(lang, "provider.live.attempt", { text, n: n.attempt, max: n.max });
}

/** D-448: why the agent ended without a result, from the code in wait_reason; null when it did not fail or the code is unknown. */
export function causeLine(waitReason: string | null, agent: string, lang: Lang = "en"): string | null {
  const c = agentFailedCause(waitReason);
  return c === null ? null : translate(lang, `provider.end.${c}`, { who: providerWho(agent, lang) });
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
  "D11.oracle": "check.D11.oracle",
  "D5.hidden": "check.D5.hidden",
  "D8.static": "check.D8.static",
  "D12.ui": "check.D12.ui",
  "D13.cheat": "check.D13.cheat",
  "D14.perf": "check.D14.perf",
  REVIEW: "check.REVIEW",
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
