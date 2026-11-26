import { z } from "zod";
import { parseReport } from "./test-report.js";

// Vitest 5.0.5 JSON reporter (4.5): unknown fields pass through, never .strict().
export const VitestAssertion = z
  .object({
    ancestorTitles: z.array(z.string()),
    title: z.string(),
    status: z.enum(["passed", "failed", "skipped", "pending", "todo", "disabled"]),
  })
  .passthrough();
export const VitestFile = z
  .object({ name: z.string(), status: z.string(), assertionResults: z.array(VitestAssertion) })
  .passthrough();
export const VitestJsonReport = z
  .object({ numTotalTests: z.number().int(), success: z.boolean(), testResults: z.array(VitestFile) })
  .passthrough();
export type TestStatus = "passed" | "failed" | "skipped" | "pending" | "todo" | "disabled";
export type ParsedReport =
  | { valid: true; success: boolean; total: number /* = tests.size, D-124 */; tests: Map<string, TestStatus>; /** D-548: ms per test, when the reporter gave it */ durations?: Map<string, number> }
  | { valid: false; error: "missing" | "too_large" | "json" | "schema" | "xml" | "duplicate_id"; detail: string };

export const MAX_REPORT_BYTES = 20 * 1024 * 1024;

/** D-680: through the common TestReport, like every other runner (the vitest/jest JSON shape). */
export function parseVitestReport(raw: string | null, workRoot: string): ParsedReport {
  return parseReport("vitest-json", raw, { workRoot });
}
