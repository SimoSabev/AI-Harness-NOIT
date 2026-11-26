import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReport } from "@mandat/contract";
import type { ParsedReport } from "@mandat/contract";
import { d1 } from "./d1.js";
import { d2 } from "./d2.js";

// E10 languages (D-680): D1 and D2 read the common TestReport view; the same rules hold for pytest and go test.
const fx = (name: string) => readFileSync(new URL(`../../../fixtures/test-reports/${name}`, import.meta.url), "utf8");
const M = "tests/test_cart.py > TestCart > test_applies_10_percent_over_50";
const base = parseReport("pytest-junit", fx("pytest-xunit1.xml"), { workRoot: "/m/work" });
const edit = (xml: string) => parseReport("pytest-junit", xml, { workRoot: "/m/work" });
const fixed = edit(fx("pytest-xunit1.xml").replace(/(name="test_applies_10_percent_over_50"[^>]*)>[\s\S]*?<\/testcase>/, "$1 />").replace('failures="1"', 'failures="0"'));
const v = (r: ParsedReport) => (r.valid ? r : (() => { throw new Error(r.error); })());

describe("D1/D2 върху pytest отчети (D-680)", () => {
  it("честна поправка: D1 pass, D2 pass (инвентарът е същият)", () => {
    expect(v(fixed).tests.get(M)).toBe("passed");
    expect(d1(base, fixed).evidence.status).toBe("pass");
    expect(d2({ baseline: base, b: fixed, exitB: 0, diffPatch: "", mayChangeTests: false }).evidence.status).toBe("pass");
  });
  it("изтрит тест: D2 missing_test fail", () => {
    const deleted = edit(fx("pytest-xunit1.xml").replace(/<testcase classname="tests.test_cart.TestCart" name="test_applies_10_percent_over_50"[\s\S]*?<\/testcase>/, "").replace('failures="1"', 'failures="0"'));
    const r = d2({ baseline: base, b: deleted, exitB: 0, diffPatch: "", mayChangeTests: false });
    expect([r.evidence.status, r.evidence.signature]).toEqual(["fail", expect.stringContaining(`missing_test:${M}`)]);
  });
  it("счупен код (грешка при събиране): D1 регресии, D2 exit_mismatch не лъже", () => {
    const broken = parseReport("pytest-junit", fx("pytest-xunit1-collect-error.xml"), { workRoot: "/m/work" });
    expect(d1(base, broken).evidence.status).toBe("fail");
    expect(d2({ baseline: base, b: broken, exitB: 0, diffPatch: "", mayChangeTests: false }).evidence.status).toBe("fail");
  });
  it("go: пропуснат тест (t.Skip) на мястото на минаващ → D2 skipped", () => {
    const g = fx("go-test.jsonl");
    const b0 = parseReport("go-test-json", g, { workRoot: "/m/work", goModule: "example.com/shop" });
    const skipped = parseReport("go-test-json", g.replace('"Action":"pass","Package":"example.com/shop/cart","Test":"TestNoDiscountAtExactly50"', '"Action":"skip","Package":"example.com/shop/cart","Test":"TestNoDiscountAtExactly50"'), { workRoot: "/m/work", goModule: "example.com/shop" });
    const r = d2({ baseline: b0, b: skipped, exitB: 1, diffPatch: "", mayChangeTests: true });
    expect(r.evidence.signature).toContain("skipped:cart > TestNoDiscountAtExactly50");
  });
});
