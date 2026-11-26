import { explain } from "@mandat/contract";
import { translate } from "../i18n/t";
import type { Key, Lang } from "../i18n/t";
import { GATES } from "./job-strategy";

// D-710: what the seal card says, pure. The seal's `unchecked` lines (core uncheckedOf) become sentences: a decision for
// the person (a surviving mutant — the very sentence of the task page, a criterion a person proves, a migration site,
// the hidden tests' grade) or a check that simply did not run (named like the gates). No detector code, no hash.
export interface SealDecision { text: string; where: string | null; change?: string }
export interface SealSummary { headline: "verified" | "unknown" | "failed"; passed: number; of: number; decide: SealDecision[]; notRun: string[] }

const unwrap = (s: string): string => s.replace(/<untrusted[^>]*>([\s\S]*?)<\/untrusted>/g, (_m, x: string) => `«${x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")}»`);
const sentence = (reason: string, lang: Lang): string => unwrap(explain({ result: "-", reasons: [reason], lang }).split("\n").slice(1).join(" "));

/** a check that did not run, by name: the gate's own name, a few more by hand, else "A check (<code>)" */
const EXTRA: Record<string, Key> = { "D10.lockfile": "seal.check.D10.lockfile", "D12.ui": "seal.check.D12.ui" };
function checkName(detector: string, lang: Lang): string {
  if ((GATES as readonly string[]).includes(detector)) return translate(lang, `job.gate.${detector}` as Key);
  const k = EXTRA[detector];
  return k ? translate(lang, k) : translate(lang, "seal.check.other", { code: detector });
}

export function sealSummary(seal: { verdict: "VERIFIED" | "UNKNOWN" | "FAILED"; checked: readonly string[]; unchecked: readonly string[] }, lang: Lang): SealSummary {
  const decide: SealDecision[] = [];
  const notRun: string[] = [];
  let human = 0;
  for (const line of seal.unchecked) {
    const mutant = /^D11\.mutation: a mutant survived at (.+):(\d+) \((.*)\); a person decides$/.exec(line);
    const grade = /^D11\.oracle: the hidden tests caught (\d+)\/(\d+) mutants/.exec(line);
    const proof = /^(AC-\d+): proof by a person$/.exec(line);
    const site = /^(.+): a migration site for a person$/.exec(line);
    const skipped = /^([A-Z][A-Za-z0-9_]*(?:\.[a-z_]+)?): not run$/.exec(line);
    if (mutant) decide.push({ text: sentence(`D11:survived:${mutant[1]}:${mutant[2]}`, lang), where: `${mutant[1]}:${mutant[2]}`, change: mutant[3] ?? "" });
    else if (grade) decide.push({ text: translate(lang, "seal.decide.grade", { killed: Number(grade[1]), total: Number(grade[2]) }), where: null });
    else if (proof) {
      human += 1;
      decide.push({ text: translate(lang, "seal.decide.proof", { id: proof[1] ?? "" }), where: proof[1] ?? null });
    } else if (site) decide.push({ text: translate(lang, "seal.decide.site"), where: site[1] ?? null });
    else if (skipped) notRun.push(checkName(skipped[1] ?? "", lang));
    else decide.push({ text: line, where: null });
  }
  const headline = seal.verdict === "VERIFIED" ? "verified" : seal.verdict === "FAILED" ? "failed" : "unknown";
  return { headline, passed: seal.checked.length, of: seal.checked.length + human, decide, notRun };
}
