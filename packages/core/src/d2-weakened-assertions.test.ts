import { describe, expect, it } from "vitest";
import { declaredTestCount, parseTestFile, weakenedAssertions } from "./test-ast.js";

const f = "tests/cart.spec.ts";
const wrap = (body: string) => `import { describe, expect, it } from "vitest";\ndescribe("cart", () => {\n${body}\n});\n`;

describe("test-ast: weakened_assertions (D-233)", () => {
  it("по-малко expect в head → fail", () => {
    const base = wrap(`  it("applies 10% over 50", () => {\n    expect(discountCents(10000)).toBe(1000);\n    expect(discountCents(20000)).toBe(2000);\n  });`);
    const head = wrap(`  it("applies 10% over 50", () => {\n    expect(discountCents(10000)).toBe(1000);\n  });`);
    expect(weakenedAssertions([{ path: f, base, head }])).toEqual([{ id: "tests/cart.spec.ts > cart > applies 10% over 50", level: "fail", base: 2, head: 1 }]);
  });
  it("премахнат expect ред без добавен (заменен с коментар) → fail; заменен с друг expect → нищо", () => {
    const base = wrap(`  it("x", () => {\n    expect(a()).toBe(1);\n  });`);
    expect(weakenedAssertions([{ path: f, base, head: wrap(`  it("x", () => {\n    // expect(a()).toBe(1);\n  });`) }])).toHaveLength(1);
    expect(weakenedAssertions([{ path: f, base, head: wrap(`  it("x", () => {\n    expect(a()).toEqual(1);\n  });`) }])).toEqual([]);
  });
  it("assert*, expect.soft и вложени describe", () => {
    const p = parseTestFile(`describe("a", () => { describe("b", () => { test("c", () => { assert(x); assertEquals(1, 1); expect.soft(y).toBe(1); }); }); });`, f);
    expect(p.tests).toHaveLength(1);
    expect(p.tests[0]?.path).toEqual(["a", "b", "c"]);
    expect(p.tests[0]?.assertions).toBe(3);
  });
  it("declaredTestCount: статични → брой; .each и цикли → null", () => {
    expect(declaredTestCount(wrap(`  it("a", () => {});\n  it.skip("b", () => {});\n  test.todo("c");`), f)).toBe(3);
    expect(declaredTestCount(wrap(`  it.each([1, 2])("n %s", (n) => { expect(n).toBeTruthy(); });`), f)).toBe(null);
    expect(declaredTestCount(wrap(`  for (const n of [1, 2]) it("n" + n, () => {});`), f)).toBe(null);
    expect(declaredTestCount(wrap(`  [1, 2].forEach((n) => it(\`n\${n}\`, () => {}));`), f)).toBe(null);
  });
});

// E9b (bench B28): the same number of expects, but an exact matcher swapped for a loose one passes for almost any value
describe("test-ast: a weaker matcher (bench B28)", () => {
  const t = (line: string) => wrap(`  it("applies 10% over 50", () => {\n    ${line}\n  });`);
  it("toBe/toEqual/toStrictEqual/toMatchObject → toBeGreaterThan/toBeTruthy/toBeDefined/.not → unknown (a human looks)", () => {
    for (const weak of ["expect(discountCents(10000)).toBeGreaterThan(0);", "expect(discountCents(10000)).toBeTruthy();", "expect(discountCents(10000)).toBeDefined();", "expect(discountCents(10000)).not.toBe(0);"]) {
      expect(weakenedAssertions([{ path: f, base: t("expect(discountCents(10000)).toBe(1000);"), head: t(weak) }])).toEqual([{ id: "tests/cart.spec.ts > cart > applies 10% over 50", level: "unknown", base: 1, head: 1 }]);
    }
    expect(weakenedAssertions([{ path: f, base: t("expect(totals()).toEqual({ a: 1 });"), head: t("expect(totals()).toBeTruthy();") }])).toHaveLength(1);
  });
  it("an exact matcher kept (another value, toBe → toEqual) or a loose one made exact is not weaker", () => {
    expect(weakenedAssertions([{ path: f, base: t("expect(discountCents(10000)).toBe(1000);"), head: t("expect(discountCents(10000)).toBe(1001);") }])).toEqual([]);
    expect(weakenedAssertions([{ path: f, base: t("expect(discountCents(10000)).toBe(1000);"), head: t("expect(discountCents(10000)).toEqual(1000);") }])).toEqual([]);
    expect(weakenedAssertions([{ path: f, base: t("expect(discountCents(10000)).toBeGreaterThan(0);"), head: t("expect(discountCents(10000)).toBe(1000);") }])).toEqual([]);
  });
});

