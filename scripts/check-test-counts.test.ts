import { describe, expect, it } from "vitest";
import { analyze, decisionFor } from "./check-test-counts.mjs";

const cfg = { "vitest.config.ts": "passWithNoTests: false," };
type T = { title: string; ancestorTitles: string[]; status: string; location?: { line: number } };
const report = (file: string, tests: T[]) => ({
  testResults: [{ name: file, assertionResults: tests.map((t) => ({ ...t, fullName: [...t.ancestorTitles, t.title].join(" ") })) }],
});
const pass: T = { title: "a", ancestorTitles: ["x"], status: "passed" };

describe("check-test-counts (т. 0.3 е)", () => {
  it("всичко минало → ok, skipped: 0", () => {
    const r = analyze({ reports: { unit: report("packages/cli/src/a.test.ts", [pass]), docker: null }, readSource: () => "", configs: cfg, ci: false });
    expect(r.ok).toBe(true);
    expect(r.lines).toContain("unit: 1 passed, 0 failed, 0 skipped");
    expect(r.lines.some((l) => l.startsWith("SKIPPED: docker"))).toBe(true);
    expect(r.lines.at(-1)).toBe("skipped: 0");
  });
  it("skip с // D-2xx: → изброен; без коментар → fail", () => {
    const src = 'it("a", () => {});\n// D-262: wrong expectation\nit.skip("b", () => {});\nit.skip("c", () => {});\n';
    const tests: T[] = [pass, { title: "b", ancestorTitles: [], status: "skipped", location: { line: 3 } }];
    const ok = analyze({ reports: { unit: report("packages/cli/src/a.test.ts", tests) }, readSource: () => src, configs: cfg, ci: false });
    expect(ok.ok).toBe(true);
    expect(ok.lines).toContain("НЕПОКРИТИ: packages/cli/src/a.test.ts > b (D-262)");
    expect(ok.lines.at(-1)).toBe("skipped: 1 (изброени)");
    const bad = analyze({ reports: { unit: report("packages/cli/src/a.test.ts", [{ title: "c", ancestorTitles: [], status: "skipped", location: { line: 4 } }]) }, readSource: () => src, configs: cfg, ci: false });
    expect(bad.ok).toBe(false);
    expect(bad.lines).toContain("НЕПОКРИТИ: packages/cli/src/a.test.ts > c (БЕЗ D-2xx)");
  });
  it("describe.skip с коментар покрива децата; todo се брои", () => {
    const src = '// D-263: later\ndescribe.skip("grp", () => {\n  it("x", () => {});\n});\nit.todo("t");\n';
    const tests: T[] = [{ title: "x", ancestorTitles: ["grp"], status: "skipped", location: { line: 3 } }, { title: "t", ancestorTitles: [], status: "todo" }];
    const r = analyze({ reports: { unit: report("apps/worker/src/a.test.ts", tests) }, readSource: () => src, configs: cfg, ci: false });
    expect(r.lines).toContain("НЕПОКРИТИ: apps/worker/src/a.test.ts > grp x (D-263)");
    expect(r.lines).toContain("НЕПОКРИТИ: apps/worker/src/a.test.ts > t (БЕЗ D-2xx)");
    expect(r.ok).toBe(false);
  });
  it("skip в ядрото → ЧАСТИЧНО", () => {
    const src = "// D-264: x\nit.skip(\"s\", () => {});\n";
    const r = analyze({ reports: { unit: report("packages/core/src/a.test.ts", [{ title: "s", ancestorTitles: [], status: "skipped", location: { line: 2 } }]) }, readSource: () => src, configs: cfg, ci: false });
    expect(r.ok).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.lines).toContain("ЧАСТИЧНО: има skip в ядрото (contract/core/ledger/verify/mcp/gate-github)");
  });
  it("failed, липсващ unit отчет, docker при CI, passWithNoTests → fail", () => {
    const failed = analyze({ reports: { unit: report("a.test.ts", [{ ...pass, status: "failed" }]) }, readSource: () => "", configs: cfg, ci: false });
    expect(failed.ok).toBe(false);
    expect(analyze({ reports: { unit: null }, readSource: () => "", configs: cfg, ci: false }).ok).toBe(false);
    expect(analyze({ reports: { unit: report("a.test.ts", [pass]), docker: null }, readSource: () => "", configs: cfg, ci: true }).ok).toBe(false);
    expect(analyze({ reports: { unit: report("a.test.ts", [pass]) }, readSource: () => "", configs: { c: "passWithNoTests: true" }, ci: false }).ok).toBe(false);
    expect(analyze({ reports: { unit: report("a.test.ts", [pass]) }, readSource: () => "", configs: { c: "" }, ci: false }).ok).toBe(false);
  });
  it("decisionFor без location търси по заглавие", () => {
    expect(decisionFor(["// D-265: y", 'it.skipIf(true)("z", () => {})'], { title: "z", ancestorTitles: [] })).toBe("D-265");
    expect(decisionFor(['it("z", () => {})'], { title: "z", ancestorTitles: [] })).toBe(null);
  });
});
