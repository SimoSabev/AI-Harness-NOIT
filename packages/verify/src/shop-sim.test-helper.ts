import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseVitestReport } from "@mandat/contract";
import { parseTestFile } from "@mandat/core";
import type { DockerRunner } from "@mandat/sandbox";
import type { TestProcedureInput, TestProcedureResult } from "./test-procedure.js";

// Fake test runner for the demo shop: derives a vitest JSON report from the tree's files (no Docker).
// "applies 10% over 50" passes iff the code is fixed and the test expects 1000, or the code is buggy and the test expects 0.
export const M_TITLE = "applies 10% over 50";

function walk(dir: string, rel = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const r = rel ? `${rel}/${n}` : n;
    if (n === "node_modules") return [];
    return statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n), r) : [r];
  });
}

export function simulateReport(treeDir: string): string {
  const fixed = readFileSync(path.join(treeDir, "src/cart.ts"), "utf8").includes("= 5000;");
  const testResults = walk(treeDir)
    .filter((f) => /\.spec\.ts$/.test(f))
    .sort()
    .map((f) => {
      const code = readFileSync(path.join(treeDir, f), "utf8");
      const assertionResults = parseTestFile(code, f).tests.flatMap((t) => {
        if (!t.path) return [];
        const title = t.path.at(-1) as string;
        const skipped = new RegExp(`(it|test)\\.(skip|todo)\\(\\s*"${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(code);
        let status = skipped ? "skipped" : "passed";
        if (!skipped && title === M_TITLE) {
          const body = code.slice(code.indexOf(`"${M_TITLE}"`));
          const expects1000 = /toBe\(1000\)/.test(body.slice(0, 200));
          status = (fixed && expects1000) || (!fixed && !expects1000) ? "passed" : "failed";
        }
        return [{ ancestorTitles: t.path.slice(0, -1), fullName: t.path.join(" "), status, title, duration: 1, failureMessages: status === "failed" ? ["x"] : [], meta: {} }];
      });
      return { startTime: 1, endTime: 2, status: assertionResults.some((a) => a.status === "failed") ? "failed" : "passed", message: "", name: `/m/work/${f}`, assertionResults };
    });
  const all = testResults.flatMap((t) => t.assertionResults);
  const n = (s: string) => all.filter((a) => a.status === s).length;
  return JSON.stringify({
    numTotalTestSuites: testResults.length, numPassedTestSuites: 0, numFailedTestSuites: 0, numPendingTestSuites: 0, numTotalTests: all.length,
    numPassedTests: n("passed"), numFailedTests: n("failed"), numPendingTests: n("skipped"), numTodoTests: 0, snapshot: {}, startTime: 1,
    success: n("failed") === 0, testResults,
  });
}

export function simRunTests(over?: (i: TestProcedureInput, raw: string) => string): (i: TestProcedureInput) => Promise<TestProcedureResult> {
  return (i) => {
    let raw = simulateReport(i.treeDir);
    if (over) raw = over(i, raw);
    const report = parseVitestReport(raw, "/m/work");
    // D-300: each mutant is simulated on the same tree (write, derive the report, restore), like the sandbox does
    const mutants = i.mutants?.map((m) => {
      const f = path.join(i.treeDir, m.path);
      writeFileSync(f, m.mutated);
      try {
        const r = parseVitestReport(simulateReport(i.treeDir), "/m/work");
        return { exit: r.valid && r.success ? 0 : 1, timedOut: false, report: r };
      } finally {
        writeFileSync(f, m.original);
      }
    });
    // E9б (D8): lint fails when a source file carries "LINT_ERROR", typecheck when one carries "TYPE_ERROR"
    const src = walk(path.join(i.treeDir, "src")).map((f) => readFileSync(path.join(i.treeDir, "src", f), "utf8")).join("\n");
    const checks = i.checks?.map((c) => ({ name: c.name, exit: src.includes(c.name === "lint" ? "LINT_ERROR" : "TYPE_ERROR") ? 1 : 0 }));
    // E9б (D12): "UI_DOWN" → the app never answered (null); "UI_ERROR" → a console error on the first route
    const ui = i.ui
      ? src.includes("UI_DOWN")
        ? null
        : { up: true, routes: i.ui.routes.map((route, n) => ({ route, console_errors: n === 0 && src.includes("UI_ERROR") ? ["Uncaught TypeError"] : [], failed_requests: [], screenshot: `route-${n}.png` })), shots: Object.fromEntries(i.ui.routes.map((_, n) => [`route-${n}.png`, Buffer.from("PNG")])) }
      : undefined;
    return Promise.resolve({ ok: true, exit: report.valid && report.success ? 0 : 1, timedOut: false, raw, report, ...(mutants ? { mutants } : {}), ...(checks ? { checks } : {}), ...(ui !== undefined ? { ui } : {}) });
  };
}

/** docker CLI stub: version 29, every image present. */
export const okDocker: DockerRunner = {
  run: (args, o) => {
    if (args[0] === "version") {
      o.onStdout?.(Buffer.from("29.9.1\n"));
      o.onStdoutLine?.("29.9.1");
    }
    return Promise.resolve({ exitCode: 0, timedOut: false });
  },
};
