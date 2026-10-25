import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

// v5 E9б (5.2): D8 static. The project's lint and typecheck count only when they pass on base (a red base is not the
// agent's); a new dependency with a license outside the allowlist, younger than 3 days (D-036) or with facts the registry
// did not give → a human decides. Pure: the exits and the registry facts come from the caller.
export interface D8Check { name: "lint" | "typecheck"; base: number | null; b: number | null }
export interface D8Dependency { name: string; version: string; license: string | null; published_at: string | null }

/** SPDX ids accepted by default (permissive); a project widens it in its profile */
export const DEFAULT_LICENSES = ["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "BlueOak-1.0.0", "CC0-1.0", "Unlicense", "Python-2.0", "MPL-2.0"] as const;
const MIN_AGE_MS = 3 * 86_400_000;

/** "(MIT OR Apache-2.0)" is fine when one side is; an AND needs every side */
function licenseOk(expr: string, allowed: ReadonlySet<string>): boolean {
  const e = expr.replace(/[()]/g, " ").trim();
  if (/\bOR\b/.test(e)) return e.split(/\s+OR\s+/).some((x) => licenseOk(x, allowed));
  return e.split(/\s+AND\s+/).every((x) => allowed.has(x.trim()));
}

export function d8Static(o: { checks: D8Check[]; deps: D8Dependency[]; now: number; licenses?: readonly string[] }): Detected {
  if (o.checks.length === 0 && o.deps.length === 0) return { evidence: ev("D8.static", "n/a", "no lint/typecheck and no new dependency"), security: [] };
  const timedOut = o.checks.find((c) => c.base !== null && c.base === 0 && c.b === null);
  const failed = o.checks.filter((c) => c.base === 0 && c.b !== null && c.b !== 0);
  const skipped = o.checks.filter((c) => c.base !== 0).map((c) => c.name);
  if (failed.length > 0) {
    const first = failed[0] as D8Check;
    return { evidence: ev("D8.static", "fail", `${failed.map((c) => c.name).join(", ")} failed on the change (passed on base)`, { failed: failed.map((c) => c.name), skipped }, { cls: first.name === "lint" ? "lint_fail" : "type_fail", id: "-" }), security: [] };
  }
  if (timedOut) return { evidence: ev("D8.static", "unknown", `${timedOut.name} timed out`, { skipped }, { cls: "timeout", id: timedOut.name }), security: [] };
  const allowed = new Set(o.licenses ?? DEFAULT_LICENSES);
  const questions = o.deps.flatMap((d) => {
    if (d.license === null || d.published_at === null) return [{ name: d.name, why: "no registry facts" }];
    if (!licenseOk(d.license, allowed)) return [{ name: d.name, why: `license ${d.license}` }];
    if (o.now - Date.parse(d.published_at) < MIN_AGE_MS) return [{ name: d.name, why: "younger than 3 days" }];
    return [];
  });
  if (questions.length > 0) {
    const q = questions[0] as { name: string };
    return { evidence: ev("D8.static", "unknown", `${questions.length} new dependenc${questions.length === 1 ? "y" : "ies"} to check`, { dependencies: questions, skipped }, { cls: "dependency", id: q.name }), security: [] };
  }
  return { evidence: ev("D8.static", "pass", `${o.checks.length - skipped.length} check(s) pass, ${o.deps.length} new dependenc${o.deps.length === 1 ? "y" : "ies"} fine`, { skipped }), security: [] };
}
