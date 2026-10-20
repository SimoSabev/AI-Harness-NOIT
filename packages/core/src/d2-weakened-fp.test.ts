import { describe, expect, it } from "vitest";
import { weakenedAssertions } from "./test-ast.js";

// Фалшиви положителни (демо промпт т. 5.7, d2-weakened-fp). Поведението е записано в D-267.
const f = "tests/cart.spec.ts";
const wrap = (body: string, pre = "") => `import { describe, expect, it } from "vitest";\n${pre}describe("cart", () => {\n${body}\n});\n`;
const base = wrap(`  it("totals", () => {\n    expect(total(1)).toBe(10);\n    expect(total(2)).toBe(20);\n    expect(total(3)).toBe(30);\n  });`);

describe("d2-weakened-fp", () => {
  it("изнасяне на expect в helper в същия файл → pass", () => {
    const head = wrap(`  it("totals", () => {\n    check(1);\n    check(2);\n    check(3);\n  });`, "function check(n: number) {\n  expect(total(n)).toBe(n * 10);\n}\n");
    expect(weakenedAssertions([{ path: f, base, head }])).toEqual([]);
  });
  it("arrow helper също се брои → pass", () => {
    const head = wrap(`  const check = (n: number) => { expect(total(n)).toBe(n * 10); };\n  it("totals", () => {\n    check(1); check(2); check(3);\n  });`);
    expect(weakenedAssertions([{ path: f, base, head }])).toEqual([]);
  });
  it("няколко expect слети в един toEqual({...}) → unknown, не fail", () => {
    const head = wrap(`  it("totals", () => {\n    expect({ a: total(1), b: total(2), c: total(3) }).toEqual({ a: 10, b: 20, c: 30 });\n  });`);
    expect(weakenedAssertions([{ path: f, base, head }])).toEqual([{ id: "tests/cart.spec.ts > cart > totals", level: "unknown", base: 3, head: 1 }]);
  });
  it("test.each с повече редове → pass", () => {
    const b = wrap(`  it.each([[1, 10]])("total %s", (n, t) => {\n    expect(total(n)).toBe(t);\n  });`);
    const h = wrap(`  it.each([[1, 10], [2, 20], [3, 30]])("total %s", (n, t) => {\n    expect(total(n)).toBe(t);\n  });`);
    expect(weakenedAssertions([{ path: f, base: b, head: h }])).toEqual([]);
  });
  it("преименуване без промяна в тялото → не е weakened_assertions (missing_test го хваща)", () => {
    const head = base.replace('"totals"', '"sums"');
    expect(weakenedAssertions([{ path: f, base, head }])).toEqual([]);
  });
  it("toBe(45) → toBe(50) не намалява броя → не се хваща (известна граница)", () => {
    const b = wrap(`  it("x", () => {\n    expect(n()).toBe(45);\n  });`);
    expect(weakenedAssertions([{ path: f, base: b, head: b.replace("45", "50") }])).toEqual([]);
  });
});
