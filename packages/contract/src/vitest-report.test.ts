import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVitestReport, testIdOf } from "./index.js";

const fx = (name: string): string =>
  readFileSync(new URL(`../../../fixtures/vitest-reports/${name}`, import.meta.url), "utf8");
const M = "tests/cart.spec.ts > cart > applies 10% over 50";

describe("vitest report", () => {
  it("testIdOf", () => {
    expect(testIdOf("/m/work/tests/cart.spec.ts", "/m/work", ["cart"], "applies 10% over 50")).toBe(M);
    expect(testIdOf("/m/work/tests/a.spec.ts", "/m/work", ["A", "B"], "t")).toBe("tests/a.spec.ts > A > B > t");
    expect(testIdOf("/m/work/tests/a.spec.ts", "/m/work/", [], "t")).toBe("tests/a.spec.ts > t");
  });

  it("parseVitestReport: валиден", () => {
    const r = parseVitestReport(fx("base-1fail.json"), "/m/work");
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.total).toBe(20);
    expect(r.success).toBe(false);
    expect(r.tests.get(M)).toBe("failed");
    expect([...r.tests.values()].filter((s) => s === "failed")).toHaveLength(1);
  });

  it("parseVitestReport: skip/todo/only (реален vitest 5.0.5)", () => {
    const r = parseVitestReport(fx("mixed.json"), "/m/work");
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.tests.get("tests/plain.spec.ts > plain > skipped one")).toBe("skipped");
    expect(r.tests.get("tests/plain.spec.ts > plain > todo one")).toBe("todo");
    expect(r.tests.get("tests/plain.spec.ts > plain > passes")).toBe("passed");
    expect(r.tests.get("tests/only.spec.ts > only > focused")).toBe("passed");
    expect(r.tests.get("tests/only.spec.ts > only > not focused")).toBe("skipped");
    expect([...r.tests.values()]).not.toContain("pending");
    expect(r.total).toBe(r.tests.size);
  });

  it("parseVitestReport: passthrough", () => {
    const j = JSON.parse(fx("base-1fail.json")) as Record<string, unknown> & { testResults: Record<string, unknown>[] };
    j.numTotalTestSuites = 2;
    j.meta = { x: 1 };
    const first = j.testResults[0] as { assertionResults: Record<string, unknown>[] };
    (first.assertionResults[0] as Record<string, unknown>).tags = ["a"];
    (first.assertionResults[0] as Record<string, unknown>).meta = {};
    expect(parseVitestReport(JSON.stringify(j), "/m/work").valid).toBe(true);
  });

  it("parseVitestReport: грешки", () => {
    const err = (raw: string | null) => {
      const r = parseVitestReport(raw, "/m/work");
      return r.valid ? "valid" : r.error;
    };
    expect(err(null)).toBe("missing");
    expect(err("{")).toBe("json");
    expect(err("{}")).toBe("schema");
    const j = JSON.parse(fx("base-1fail.json")) as { testResults: { assertionResults: unknown[] }[] };
    const file = j.testResults[0];
    if (!file) throw new Error("fixture");
    file.assertionResults.push(file.assertionResults[0]);
    expect(err(JSON.stringify(j))).toBe("duplicate_id");
    expect(err(" ".repeat(20 * 1024 * 1024 + 1))).toBe("too_large");
  });
});
