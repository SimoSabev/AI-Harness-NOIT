import { z } from "zod";
import { testIdOf } from "./test-id.js";

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
  | { valid: true; success: boolean; total: number /* = tests.size, D-124 */; tests: Map<string, TestStatus> }
  | { valid: false; error: "missing" | "too_large" | "json" | "schema" | "duplicate_id"; detail: string };

export const MAX_REPORT_BYTES = 20 * 1024 * 1024;

export function parseVitestReport(raw: string | null, workRoot: string): ParsedReport {
  if (raw === null) return { valid: false, error: "missing", detail: "no report" };
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > MAX_REPORT_BYTES) return { valid: false, error: "too_large", detail: `${bytes} bytes` };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { valid: false, error: "json", detail: e instanceof Error ? e.message : String(e) };
  }
  const r = VitestJsonReport.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    return { valid: false, error: "schema", detail: first ? `${first.path.join(".")}: ${first.message}` : "invalid" };
  }
  const tests = new Map<string, TestStatus>();
  for (const file of r.data.testResults) {
    for (const a of file.assertionResults) {
      const id = testIdOf(file.name, workRoot, a.ancestorTitles, a.title);
      if (tests.has(id)) return { valid: false, error: "duplicate_id", detail: id };
      tests.set(id, a.status);
    }
  }
  return { valid: true, success: r.data.success, total: tests.size, tests };
}
