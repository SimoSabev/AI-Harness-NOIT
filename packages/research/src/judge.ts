import type { ClaimVerdict } from "@mandat/contract";

// E9г (PRD 6.13 step 5, AC-13.4): the verdict of a claim from its quotes. confirmed = supporting quotes from ≥ 2
// independent sites; single = one site; conflict = a supporting and a refuting quote (both shown); unchecked = no quote.
// The date of a claim is the OLDEST date among its supporting sources.

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "or", "ne", "go"]);
/** the registrable part of a host, roughly: docs.python.org → python.org, bbc.co.uk → bbc.co.uk */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2] ?? "";
  const tld = parts[parts.length - 1] ?? "";
  return (SECOND_LEVEL.has(sld) && tld.length === 2 ? parts.slice(-3) : parts.slice(-2)).join(".");
}

export interface ClaimEvidence {
  domain: string;
  stance: "support" | "refute";
  published: string | null;
}
export function claimVerdict(evidence: readonly ClaimEvidence[]): ClaimVerdict {
  const sup = new Set(evidence.filter((e) => e.stance === "support").map((e) => siteOf(e.domain)));
  const ref = evidence.some((e) => e.stance === "refute");
  if (ref) return "conflict";
  if (sup.size >= 2) return "confirmed";
  if (sup.size === 1) return "single";
  return "unchecked";
}
export function claimAsOf(evidence: readonly ClaimEvidence[]): string | null {
  const dates = evidence.filter((e) => e.stance === "support" && e.published !== null && !Number.isNaN(Date.parse(e.published))).map((e) => e.published as string);
  return dates.length === 0 ? null : dates.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
}

/** PRD 6.13 step 6: the linter of the synthesis. A citation [n] must name a known source; a sentence that states a
 * fact (≥ 40 characters, not a heading or a question) needs at least one citation. */
export interface LintResult {
  text: string;
  unknown_refs: number[];
  uncited: string[];
}
export function lintSynthesis(text: string, known: ReadonlySet<number>): LintResult {
  const unknown = new Set<number>();
  const cleaned = text.replace(/\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g, (_m, list: string) => {
    const ns = list.split(",").map((x) => Number(x.trim()));
    const ok = ns.filter((n) => known.has(n));
    for (const n of ns) if (!known.has(n)) unknown.add(n);
    return ok.length > 0 ? `[${ok.join(", ")}]` : "";
  });
  const uncited: string[] = [];
  for (const line of cleaned.split("\n")) {
    const l = line.trim();
    if (l === "" || /^#{1,6}\s/.test(l) || /^\|/.test(l) || /^```/.test(l)) continue;
    for (const s of l.replace(/^[-*]\s+|^\d+\.\s+/, "").split(/(?<=[.!?])\s+(?=[\p{Lu}\d"„(])/u)) {
      const t = s.trim();
      if (t.length < 40 || t.endsWith("?") || t.endsWith(":") || /\[\d/.test(t)) continue;
      uncited.push(t);
    }
  }
  return { text: cleaned.replace(/[ \t]+([.,;:])/g, "$1").replace(/[ \t]{2,}/g, " "), unknown_refs: [...unknown].sort((a, b) => a - b), uncited };
}
