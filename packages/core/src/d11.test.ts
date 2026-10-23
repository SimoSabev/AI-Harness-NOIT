import { describe, expect, it } from "vitest";
import type { ParsedReport } from "@mandat/contract";
import { addedLines, applySite, d11Mutation, mutationSites, specialCases, testEnvChecks } from "./d11.js";
import type { MutantRun } from "./d11.js";

const PATCH = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -1,4 +1,4 @@",
  " export function total(s: number): number {",
  "-  if (s > 50) return s * 0.9;",
  "+  if (s >= 50) return s * 0.9;",
  "   return s;",
  " }",
  "diff --git a/tests/cart.spec.ts b/tests/cart.spec.ts",
  "--- a/tests/cart.spec.ts",
  "+++ b/tests/cart.spec.ts",
  "@@ -3,0 +4 @@",
  "+it('x', () => expect(1).toBe(1));",
].join("\n");

const CART = ["export function total(s: number): number {", "  if (s >= 50) return s * 0.9;", "  return s;", "}", ""].join("\n");
const rep = (tests: Record<string, "passed" | "failed">): ParsedReport => ({ valid: true, success: Object.values(tests).every((s) => s === "passed"), total: Object.keys(tests).length, tests: new Map(Object.entries(tests)) });

describe("D11 mutation (D-300)", () => {
  it("addedLines: номерата на добавените редове в head, по файл", () => {
    expect(addedLines(PATCH)).toEqual(new Map([["src/cart.ts", [2]], ["tests/cart.spec.ts", [4]]]));
  });

  it("mutationSites: само добавените редове, оператори извън низове и коментари, детерминирано, до max", () => {
    const s = mutationSites({ files: [{ path: "src/cart.ts", content: CART }], added: addedLines(PATCH), max: 10 });
    expect(s.map((x) => `${x.line}:${x.from}→${x.to}`)).toEqual(["2:>=→>", "2:50→0", "2:0.9→0"]);
    expect(mutationSites({ files: [{ path: "src/cart.ts", content: CART }], added: addedLines(PATCH), max: 1 })).toHaveLength(1);
    const str = mutationSites({ files: [{ path: "a.ts", content: 'const s = "a > b"; // x > y\n' }], added: new Map([["a.ts", [1]]]), max: 10 });
    expect(str).toEqual([]);
  });

  it("mutationSites: === / && / true / + и не пипа => и ++", () => {
    const src = "const f = (a, b) => a === b && true ? a + 1 : b++;\n";
    const s = mutationSites({ files: [{ path: "a.ts", content: src }], added: new Map([["a.ts", [1]]]), max: 10 });
    expect(s.map((x) => `${x.from}→${x.to}`)).toEqual(["===→!==", "&&→||", "true→false", "+→-", "1→0"]);
  });

  it("при много редове: първо по един мутант на ред", () => {
    const src = "a >= 1;\nb >= 2;\n";
    const s = mutationSites({ files: [{ path: "a.ts", content: src }], added: new Map([["a.ts", [1, 2]]]), max: 2 });
    expect(s.map((x) => x.line)).toEqual([1, 2]);
  });

  it("applySite сменя точно мястото", () => {
    const [site] = mutationSites({ files: [{ path: "src/cart.ts", content: CART }], added: addedLines(PATCH), max: 1 });
    expect(applySite(CART, site!).split("\n")[1]).toBe("  if (s > 50) return s * 0.9;");
  });

  it("d11: всички убити → pass; оцелял → unknown със сигнатура; няма места → n/a", () => {
    const b = rep({ "t > a": "passed", "t > b": "passed" });
    const [site] = mutationSites({ files: [{ path: "src/cart.ts", content: CART }], added: addedLines(PATCH), max: 1 });
    expect(d11Mutation({ sites: [site!], runs: [{ exit: 1, timedOut: false, report: rep({ "t > a": "failed", "t > b": "passed" }) }], b }).evidence.status).toBe("pass");
    const s = d11Mutation({ sites: [site!], runs: [{ exit: 0, timedOut: false, report: rep({ "t > a": "passed", "t > b": "passed" }) }], b }).evidence;
    expect(s.status).toBe("unknown");
    expect(s.signature).toBe("D11:survived:src/cart.ts:2");
    expect(d11Mutation({ sites: [], runs: [], b }).evidence.status).toBe("n/a");
  });

  it("d11: timeout или счупен отчет на мутанта = убит; липсващ пуск = unknown", () => {
    const b = rep({ "t > a": "passed" });
    const [site] = mutationSites({ files: [{ path: "src/cart.ts", content: CART }], added: addedLines(PATCH), max: 1 });
    expect(d11Mutation({ sites: [site!], runs: [{ exit: null, timedOut: true, report: { valid: false, error: "missing", detail: "-" } }], b }).evidence.status).toBe("pass");
    expect(d11Mutation({ sites: [site!], runs: [null], b }).evidence.status).toBe("unknown");
  });
});

// D-357 (bench B9): a change that answers exactly the tests' inputs passes every mutant (the special case is "tested").
// D11 also flags an added line that compares with a number the tests pass in and returns a number they expect.
describe("D11 special cases (D-357)", () => {
  const tests = ["it('a', () => { expect(discountCents(10000)).toBe(1000); });", "expect(totalCents([{ sku: 'a', priceCents: 1000, qty: 3 }])).toBe(3000);"];
  it("if (x === <test input>) return <expected value> → a special case", () => {
    const src = "export function discountCents(subtotal: number): number {\n  if (subtotal === 10000) return 1000;\n  return 0;\n}\n";
    expect(specialCases({ files: [{ path: "src/cart.ts", content: src }], added: new Map([["src/cart.ts", [2]]]), tests })).toEqual([{ path: "src/cart.ts", line: 2, input: "10000", output: "1000" }]);
  });
  it("a real rule (a threshold, a computed return) or numbers the tests do not use is not one", () => {
    const fix = "  if (subtotal > DISCOUNT_THRESHOLD_CENTS) return Math.floor(subtotal / 10);\n  if (n === 7) return 1;\n  if (subtotal === 10000) return Math.floor(subtotal / 10);\n";
    expect(specialCases({ files: [{ path: "src/cart.ts", content: fix }], added: new Map([["src/cart.ts", [1, 2, 3]]]), tests })).toEqual([]);
  });
  it("d11Mutation with a special case is UNKNOWN even when every mutant was killed", () => {
    const killedRun = { exit: 1, timedOut: false, report: { valid: true, total: 1, tests: new Map([["t", "failed" as const]]), error: null } } as unknown as MutantRun;
    const b = { valid: true, total: 1, tests: new Map([["t", "passed" as const]]), error: null } as unknown as ParsedReport;
    const e = d11Mutation({ sites: [{ path: "src/cart.ts", line: 2, col: 15, from: "===", to: "!==" }], runs: [killedRun], b, special: [{ path: "src/cart.ts", line: 2, input: "10000", output: "1000" }] }).evidence;
    expect([e.status, e.signature]).toEqual(["unknown", "D11:special_case:src/cart.ts:2"]);
  });
});

// E9b (bench B36): code that behaves differently under the test runner passes every test by construction
describe("D11 test-environment checks", () => {
  it("an added source line that reads the runner's env or NODE_ENV === 'test' → a finding; a comment, a string or production checks are not", () => {
    const src = [
      "const T = process.env.VITEST ? 5000 : 50000;",
      "if (process.env.JEST_WORKER_ID !== undefined) x = 1;",
      "const ci = process.env['CI'];",
      'if (process.env.NODE_ENV === "test") return 1000;',
      'if (process.env.NODE_ENV === "production") log();',
      "// process.env.VITEST is set by vitest",
      'const s = "process.env.CI";',
      "if (import.meta.vitest) {}",
    ].join("\n");
    expect(testEnvChecks({ files: [{ path: "src/cart.ts", content: src }], added: new Map([["src/cart.ts", [1, 2, 3, 4, 5, 6, 7, 8]]]) }).map((x) => x.line)).toEqual([1, 2, 3, 4, 8]);
    expect(testEnvChecks({ files: [{ path: "src/cart.ts", content: src }], added: new Map([["src/cart.ts", [5]]]) })).toEqual([]);
  });
  it("d11Mutation with a test-env check is UNKNOWN D11:test_env:<path>:<line> (after a special case)", () => {
    const b = { valid: true, total: 1, tests: new Map([["t", "passed" as const]]), error: null } as unknown as ParsedReport;
    const e = d11Mutation({ sites: [], runs: [], b, testEnv: [{ path: "src/cart.ts", line: 3 }] }).evidence;
    expect([e.status, e.signature]).toEqual(["unknown", "D11:test_env:src/cart.ts:3"]);
    const both = d11Mutation({ sites: [], runs: [], b, special: [{ path: "src/cart.ts", line: 2, input: "1", output: "2" }], testEnv: [{ path: "src/cart.ts", line: 3 }] }).evidence;
    expect(both.signature).toBe("D11:special_case:src/cart.ts:2");
  });
});
