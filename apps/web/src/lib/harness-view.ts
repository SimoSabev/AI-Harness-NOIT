import { translate } from "../i18n/t";
import type { Lang } from "../i18n/t";

// D-298: the auto-harness in plain words — what each field of .mandat.yml means and where the scanner took it from.
const FIELDS = ["runtime.package_manager", "runtime.install", "runtime.node", "tests.framework", "tests.command", "tests.test_globs", "ci.workflow", "ci.required_checks", "risk_classes", "task_types"] as const;
const SOURCES = ["lockfile", "ci.yml", "package.json#scripts.test", "baseline", "default", "human"] as const;
const PROPOSALS = ["proposed", "approved", "draft", "accepted", "rejected"] as const;
const isOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);
type ProposalTone = "gray" | "blue" | "green" | "red" | "amber";
const PROPOSAL_TONE: Record<(typeof PROPOSALS)[number], ProposalTone> = { proposed: "amber", approved: "green", draft: "gray", accepted: "green", rejected: "red" };

export function fieldLabel(key: string, lang: Lang = "en"): string {
  return isOf(FIELDS, key) ? translate(lang, `field.${key}`) : key;
}

export function sourceLabel(src: string, lang: Lang = "en"): string {
  return isOf(SOURCES, src) ? translate(lang, `source.${src}`) : src;
}

export function proposalStatus(status: string, lang: Lang = "en"): { label: string; tone: ProposalTone } {
  return isOf(PROPOSALS, status) ? { label: translate(lang, `proposal.${status}`), tone: PROPOSAL_TONE[status] } : { label: status, tone: "gray" };
}

/** Fields the scanner could not settle: the human has to confirm them before the rules hold. */
export function humanFields(sources: Record<string, string>): string[] {
  return Object.entries(sources).filter(([, s]) => s === "human").map(([k]) => k).sort();
}
