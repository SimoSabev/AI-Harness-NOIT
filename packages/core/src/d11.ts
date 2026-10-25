import type { Evidence, ParsedReport } from "@mandat/contract";
import { ev } from "./evidence.js";

// D-300 (Симо, 21.10.2026: „мутационна проверка“): Мандат breaks each changed line on purpose (one operator or number at a
// time). If the tests still pass on the broken code, they do not check the change → UNKNOWN (never FAILED: the change may
// be right, the proof is missing). Pure: the sandbox runs are done by @mandat/verify.

export interface MutationSite { path: string; line: number; col: number; from: string; to: string }
export interface MutantRun { exit: number | null; timedOut: boolean; report: ParsedReport }

/** Head line numbers of the added lines of a unified diff, per file. */
export function addedLines(diffPatch: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  let file: string | null = null;
  let line = 0;
  for (const l of diffPatch.split("\n")) {
    if (l.startsWith("diff --git ")) {
      file = null;
      continue;
    }
    if (l.startsWith("+++ ")) {
      file = l === "+++ /dev/null" ? null : l.replace(/^\+\+\+ (b\/)?/, "");
      continue;
    }
    if (l.startsWith("--- ")) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      line = Number(h[1]);
      continue;
    }
    if (file === null || line === 0) continue;
    if (l.startsWith("+")) {
      out.set(file, [...(out.get(file) ?? []), line]);
      line++;
    } else if (l.startsWith(" ")) line++;
  }
  return out;
}

/** The line with string literals, template literals and comments blanked (same length), so operators inside them are not mutated. */
function codeOnly(line: string): string {
  let out = "";
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (q) {
      out += " ";
      if (c === "\\") {
        out += i + 1 < line.length ? " " : "";
        i++;
      } else if (c === q) q = null;
      continue;
    }
    if (c === "/" && line[i + 1] === "/") return out + " ".repeat(line.length - i);
    if (c === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      const stop = end === -1 ? line.length : end + 2;
      out += " ".repeat(stop - i);
      i = stop - 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      q = c;
      out += " ";
      continue;
    }
    out += c;
  }
  return out;
}

const OPS: { re: RegExp; to: (m: string) => string }[] = [
  { re: /===/g, to: () => "!==" },
  { re: /!==/g, to: () => "===" },
  { re: /(?<![=!<>])==(?!=)/g, to: () => "!=" },
  { re: /(?<![=!])!=(?!=)/g, to: () => "==" },
  { re: /(?<![<>=!])>=(?!=)/g, to: () => ">" },
  { re: /(?<![<>=!])<=(?!=)/g, to: () => "<" },
  { re: /(?<=\s)>(?=\s)/g, to: () => ">=" },
  { re: /(?<=\s)<(?=\s)/g, to: () => "<=" },
  { re: /&&/g, to: () => "||" },
  { re: /\|\|/g, to: () => "&&" },
  { re: /\btrue\b/g, to: () => "false" },
  { re: /\bfalse\b/g, to: () => "true" },
  { re: /(?<=\s)\+(?=\s)/g, to: () => "-" },
  { re: /(?<=\s)-(?=\s)/g, to: () => "+" },
  // a constant → 0 (0 → 1): "does this number matter at all"; n+1 is too often equivalent at a boundary (5000 vs 5001)
  { re: /(?<![\w.$])\d+(?:\.\d+)?(?![\w.])/g, to: (m) => (Number(m) === 0 ? "1" : "0") },
];

function sitesOfLine(path: string, n: number, text: string): MutationSite[] {
  const t = text.trimStart();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("import ") || t.startsWith("export {")) return [];
  const code = codeOnly(text);
  const out: MutationSite[] = [];
  for (const op of OPS) {
    for (const m of code.matchAll(op.re)) out.push({ path, line: n, col: m.index, from: m[0], to: op.to(m[0]) });
  }
  return out.sort((a, b) => a.col - b.col);
}

/** Deterministic: files by path, lines ascending; first one site per line, then the second of each line, … up to max. */
export function mutationSites(o: { files: { path: string; content: string }[]; added: Map<string, number[]>; max: number }): MutationSite[] {
  const perLine: MutationSite[][] = [];
  for (const f of [...o.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const lines = f.content.split("\n");
    for (const n of [...(o.added.get(f.path) ?? [])].sort((a, b) => a - b)) {
      const s = sitesOfLine(f.path, n, lines[n - 1] ?? "");
      if (s.length > 0) perLine.push(s);
    }
  }
  const out: MutationSite[] = [];
  for (let round = 0; out.length < o.max && perLine.some((s) => s.length > round); round++) {
    for (const s of perLine) {
      const site = s[round];
      if (site && out.length < o.max) out.push(site);
    }
  }
  return out;
}

export function applySite(content: string, s: MutationSite): string {
  const lines = content.split("\n");
  const l = lines[s.line - 1];
  if (l === undefined || l.slice(s.col, s.col + s.from.length) !== s.from) throw new Error(`mutation site moved: ${s.path}:${s.line}`);
  lines[s.line - 1] = l.slice(0, s.col) + s.to + l.slice(s.col + s.from.length);
  return lines.join("\n");
}

/** Killed = the tests noticed: non-zero exit, timeout, broken report, or a test that passed on B no longer passes. */
function killed(r: MutantRun, b: ParsedReport): boolean {
  if (r.timedOut || !r.report.valid || r.exit !== 0) return true;
  if (!b.valid) return true;
  const after = r.report.tests;
  for (const [id, st] of b.tests) if (st === "passed" && after.get(id) !== "passed") return true;
  return false;
}

export interface SpecialCase { path: string; line: number; input: string; output: string }
const NUM = "-?\\d+(?:\\.\\d+)?";
/**
 * D-357: an added source line `if (<x> === <N>) return <M>;` where N is a number the tests pass in and M a number they
 * expect. Mutants cannot see it (the special case is exactly what the tests check), so it is evidence of its own.
 */
export function specialCases(o: { files: { path: string; content: string }[]; added: Map<string, number[]>; tests: readonly string[] }): SpecialCase[] {
  const t = o.tests.join("\n");
  const usedAsInput = (n: string) => new RegExp(`[(,\\[{:]\\s*${n.replace(".", "\\.")}\\s*[),\\]}]`).test(t);
  const expected = (n: string) => new RegExp(`\\.(?:toBe|toEqual|toStrictEqual)\\(\\s*${n.replace(".", "\\.")}\\s*\\)`).test(t);
  const out: SpecialCase[] = [];
  const re = new RegExp(`===?\\s*(${NUM})\\s*\\)\\s*\\{?\\s*return\\s+(${NUM})\\s*;?\\s*\\}?\\s*$`);
  for (const f of o.files) {
    const lines = f.content.split("\n");
    for (const n of o.added.get(f.path) ?? []) {
      const m = re.exec(codeOnly(lines[n - 1] ?? "").trimEnd());
      if (m?.[1] && m[2] && usedAsInput(m[1]) && expected(m[2])) out.push({ path: f.path, line: n, input: m[1], output: m[2] });
    }
  }
  return out;
}

export interface TestEnvCheck { path: string; line: number }
const RUNNER_ENV = /process\.env(?:\.|\[\s*['"`])(?:VITEST\w*|JEST_WORKER_ID|CI)\b/;
const NODE_ENV_TEST = /process\.env(?:\.NODE_ENV|\[\s*['"`]NODE_ENV['"`]\s*\])\s*[!=]==?\s*['"`]test['"`]/;
/**
 * E9b (bench B36): an added source line that asks whether it runs under the test runner (the runner's env vars,
 * NODE_ENV === "test", import.meta.vitest). Such code can pass every test by construction; a human looks.
 */
export function testEnvChecks(o: { files: { path: string; content: string }[]; added: Map<string, number[]> }): TestEnvCheck[] {
  const out: TestEnvCheck[] = [];
  for (const f of o.files) {
    const lines = f.content.split("\n");
    for (const n of o.added.get(f.path) ?? []) {
      const raw = lines[n - 1] ?? "";
      const code = codeOnly(raw);
      const hit = /\bimport\.meta\.vitest\b/.test(code) || (/\bprocess\.env\b/.test(code) && (RUNNER_ENV.test(raw) || NODE_ENV_TEST.test(raw)));
      if (hit) out.push({ path: f.path, line: n });
    }
  }
  return out;
}

export function d11Mutation(o: { sites: MutationSite[]; runs: (MutantRun | null)[]; b: ParsedReport; special?: readonly SpecialCase[]; testEnv?: readonly TestEnvCheck[] }): { evidence: Evidence } {
  const sp = o.special?.[0];
  if (sp) {
    return { evidence: ev("D11.mutation", "unknown", `a special case for a test input (${sp.path}:${sp.line}: ${sp.input} → ${sp.output}); the tests cannot tell it from a fix`, { special: o.special }, { cls: "special_case", id: `${sp.path}:${sp.line}` }) };
  }
  const te = o.testEnv?.[0];
  if (te) {
    return { evidence: ev("D11.mutation", "unknown", `the change checks for the test environment (${te.path}:${te.line}); code that behaves differently under tests passes them by construction`, { test_env: o.testEnv }, { cls: "test_env", id: `${te.path}:${te.line}` }) };
  }
  if (o.sites.length === 0) return { evidence: ev("D11.mutation", "n/a", "no mutable changed lines") };
  if (o.runs.length !== o.sites.length || o.runs.some((r) => r === null)) {
    return { evidence: ev("D11.mutation", "unknown", "mutants not run", { sites: o.sites.length }, { cls: "not_run", id: "-" }) };
  }
  const survived = o.sites.filter((_, k) => !killed(o.runs[k] as MutantRun, o.b));
  const data = { sites: o.sites.length, killed: o.sites.length - survived.length, survived: survived.map((s) => ({ path: s.path, line: s.line, from: s.from, to: s.to })) };
  const first = survived[0];
  if (first) return { evidence: ev("D11.mutation", "unknown", `${survived.length}/${o.sites.length} mutants survived (first ${first.path}:${first.line} ${first.from} → ${first.to})`, data, { cls: "survived", id: `${first.path}:${first.line}` }) };
  return { evidence: ev("D11.mutation", "pass", `${o.sites.length}/${o.sites.length} mutants killed`, data) };
}
