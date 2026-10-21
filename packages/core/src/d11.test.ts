import { describe, expect, it } from "vitest";
import type { ParsedReport } from "@mandat/contract";
import { addedLines, applySite, d11Mutation, mutationSites } from "./d11.js";

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
