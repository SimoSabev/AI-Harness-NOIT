#!/usr/bin/env node
// Демо промпт т. 0.3 (е) / D-261: `pnpm check` is not "done". Reads the vitest JSON reports, lists every
// skipped/pending/todo test as "НЕПОКРИТИ: <file> > <test> (D-2xx)", fails on a skip without a `// D-2xx:` comment,
// on failed tests and on `passWithNoTests` not being false. A skip in a core package makes the phase ЧАСТИЧНО.
// Docker tests that did not run: CI=true → fail; locally → listed as SKIPPED, never as passed.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPORTS = Object.freeze({ unit: "test-results/unit.json", docker: "test-results/docker.json", live: "test-results/live.json" });
export const CONFIGS = Object.freeze(["vitest.config.ts", "vitest.docker.config.ts", "vitest.live.config.ts"]);
const CORE_DIRS = ["packages/contract/", "packages/core/", "packages/ledger/", "packages/verify/", "packages/mcp/", "packages/gate-github/"];
const DECISION = /\/\/\s*(D-2\d\d):/;
const NOT_RUN = new Set(["skipped", "pending", "todo", "disabled"]);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The `// D-2xx:` comment for a skipped test: on the test's line or the line above, or on/above an enclosing
 * `describe.skip(...)` whose title is one of the ancestors.
 * @param {string[]} lines @param {{ title: string, ancestorTitles: string[], location?: { line: number } }} t
 * @returns {string | null}
 */
export function decisionFor(lines, t) {
  const near = (i) => DECISION.exec(lines[i] ?? "")?.[1] ?? DECISION.exec(lines[i - 1] ?? "")?.[1] ?? null;
  if (t.location) {
    const d = near(t.location.line - 1);
    if (d) return d;
  }
  for (const title of [t.title, ...t.ancestorTitles]) {
    const re = new RegExp(`\\.(skip|todo|skipIf\\([^)]*\\))\\s*\\(\\s*["'\`]${escape(title)}["'\`]`);
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) {
      const d = near(i);
      if (d) return d;
    }
  }
  return null;
}

/**
 * @param {{ reports: Record<string, unknown | null>, readSource: (file: string) => string, configs: Record<string, string>, ci: boolean }} o
 * @returns {{ ok: boolean, partial: boolean, lines: string[], skipped: number }}
 */
export function analyze(o) {
  const out = [];
  let ok = true;
  let partial = false;
  let skipped = 0;
  for (const [name, text] of Object.entries(o.configs)) {
    if (!/passWithNoTests:\s*false/.test(text) || /passWithNoTests:\s*true/.test(text)) {
      out.push(`ГРЕШКА: ${name}: passWithNoTests трябва да е false`);
      ok = false;
    }
  }
  for (const [kind, report] of Object.entries(o.reports)) {
    if (report === null) {
      if (kind === "unit" || (kind === "docker" && o.ci)) {
        out.push(`ГРЕШКА: ${kind}: няма отчет (${REPORTS[kind] ?? kind})`);
        ok = false;
      } else {
        out.push(`SKIPPED: ${kind}: не е пускан (няма ${REPORTS[kind] ?? kind}); не се брои за минал`);
      }
      continue;
    }
    const r = /** @type {{ testResults: { name: string, assertionResults: { title: string, fullName: string, ancestorTitles: string[], status: string, location?: { line: number } }[] }[] }} */ (report);
    let passed = 0;
    let failed = 0;
    let kindSkipped = 0;
    for (const file of r.testResults) {
      const rel = path.isAbsolute(file.name) ? path.relative(repo, file.name) : file.name;
      let lines = null;
      for (const t of file.assertionResults) {
        if (t.status === "passed") passed++;
        else if (t.status === "failed") failed++;
        else if (NOT_RUN.has(t.status)) {
          kindSkipped++;
          lines ??= o.readSource(file.name).split("\n");
          const d = decisionFor(lines, t);
          out.push(`НЕПОКРИТИ: ${rel} > ${t.fullName} (${d ?? "БЕЗ D-2xx"})`);
          if (!d) ok = false;
          // D-276: a live test without its env is "чака Симо" (ГОТОВО (live чака Симо)), not ЧАСТИЧНО
          if (kind !== "live" && CORE_DIRS.some((c) => rel.startsWith(c))) partial = true;
          if (kind === "docker" && o.ci) ok = false;
        }
      }
    }
    if (failed > 0) ok = false;
    skipped += kindSkipped;
    out.unshift(`${kind}: ${passed} passed, ${failed} failed, ${kindSkipped} skipped`);
  }
  if (partial) out.push("ЧАСТИЧНО: има skip в ядрото (contract/core/ledger/verify/mcp/gate-github)");
  out.push(`skipped: ${skipped}${skipped > 0 ? " (изброени)" : ""}`);
  return { ok, partial, lines: out, skipped };
}

function readJson(rel) {
  const p = path.join(repo, rel);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = analyze({
    reports: Object.fromEntries(Object.entries(REPORTS).map(([k, v]) => [k, readJson(v)])),
    readSource: (f) => readFileSync(path.isAbsolute(f) ? f : path.join(repo, f), "utf8"),
    configs: Object.fromEntries(CONFIGS.map((c) => [c, readFileSync(path.join(repo, c), "utf8")])),
    ci: process.env.CI === "true",
  });
  for (const l of r.lines) console.log(l);
  if (!r.ok) process.exit(1);
}
