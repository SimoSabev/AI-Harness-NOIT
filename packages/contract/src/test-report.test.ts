import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TestReport, goTestJsonToTestReport, libtestToTestReport, parseReport, parseVitestReport, parsedFromTestReport, pytestJunitToTestReport, vitestToTestReport } from "./index.js";
import type { ParsedReport } from "./index.js";

// E10 languages (D-680): one report format for every runner; the detectors read only what it becomes (ParsedReport).
const fx = (dir: string, name: string): string => readFileSync(new URL(`../../../fixtures/${dir}/${name}`, import.meta.url), "utf8");
const ok = (r: ParsedReport) => {
  if (!r.valid) throw new Error(`invalid: ${r.error} ${r.detail}`);
  return r;
};

describe("TestReport (D-680)", () => {
  it("schema: строг, версия 1, известен инструмент", () => {
    const good = { version: 1, tool: "pytest", success: true, tests: [{ file: "tests/test_a.py", suite: ["TestA"], name: "test_x", status: "passed", duration_ms: 1 }] };
    expect(TestReport.safeParse(good).success).toBe(true);
    expect(TestReport.safeParse({ ...good, version: 2 }).success).toBe(false);
    expect(TestReport.safeParse({ ...good, tool: "mocha" }).success).toBe(false);
    expect(TestReport.safeParse({ ...good, extra: 1 }).success).toBe(false);
    expect(TestReport.safeParse({ ...good, tests: [{ ...good.tests[0], status: "ok" }] }).success).toBe(false);
  });

  it("parsedFromTestReport: id по D-025, success и времена; дублиран id → невалиден", () => {
    const r = ok(parsedFromTestReport({ version: 1, tool: "go", success: false, tests: [{ file: "cart", suite: ["TestA"], name: "sub", status: "failed", duration_ms: 3 }, { file: "cart", suite: [], name: "TestA", status: "failed" }] }));
    expect([...r.tests]).toEqual([["cart > TestA > sub", "failed"], ["cart > TestA", "failed"]]);
    expect([r.total, r.success, r.durations?.get("cart > TestA > sub")]).toEqual([2, false, 3]);
    const dup = parsedFromTestReport({ version: 1, tool: "vitest", success: true, tests: [{ file: "a", suite: [], name: "t", status: "passed" }, { file: "a", suite: [], name: "t", status: "passed" }] });
    expect(dup.valid ? "valid" : dup.error).toBe("duplicate_id");
  });

  it("vitest → TestReport → ParsedReport е същото като досега (без регресия за JS/TS)", () => {
    for (const name of ["base-1fail.json", "mixed.json"]) {
      const raw = fx("vitest-reports", name);
      const via = vitestToTestReport(raw, "/m/work");
      if (!via.ok) throw new Error(via.detail);
      const a = ok(parseVitestReport(raw, "/m/work"));
      const b = ok(parsedFromTestReport(via.report));
      expect([...b.tests]).toEqual([...a.tests]);
      expect([b.success, b.total]).toEqual([a.success, a.total]);
      expect(ok(parseReport("vitest-json", raw, { workRoot: "/m/work" })).tests).toEqual(a.tests);
      expect(ok(parseReport("jest-json", raw, { workRoot: "/m/work" })).tests).toEqual(a.tests);
    }
  });

  it("parseReport: общите грешки за всеки формат", () => {
    for (const f of ["vitest-json", "pytest-junit", "go-test-json", "libtest-json"] as const) {
      const r = parseReport(f, null, { workRoot: "/m/work" });
      expect(r.valid ? "valid" : r.error).toBe("missing");
      const big = parseReport(f, "x".repeat(20 * 1024 * 1024 + 1), { workRoot: "/m/work" });
      expect(big.valid ? "valid" : big.error).toBe("too_large");
    }
  });
});

describe("pytest junit (xunit1) → TestReport (D-680, реален pytest 9.2.0)", () => {
  const M = "tests/test_cart.py > TestCart > test_applies_10_percent_over_50";
  it("файл, клас, параметризация, skip, xfail, провал", () => {
    const r = ok(parseReport("pytest-junit", fx("test-reports", "pytest-xunit1.xml"), { workRoot: "/m/work" }));
    expect(r.total).toBe(22);
    expect(r.success).toBe(false);
    expect(r.tests.get(M)).toBe("failed");
    expect(r.tests.get("tests/test_cart.py > TestCart > test_no_discount_at_exactly_50")).toBe("passed");
    expect(r.tests.get("tests/test_money.py > test_formats_cents_as_euros[-1234--12.34 EUR]")).toBe("passed");
    expect(r.tests.get("tests/test_money.py > test_skipped_one")).toBe("skipped");
    expect(r.tests.get("tests/test_money.py > test_xfail_one")).toBe("skipped");
    expect([...r.tests.values()].filter((s) => s === "failed")).toHaveLength(1);
  });
  it("грешка при събиране → провален тест на модула; success=false", () => {
    const r = ok(parseReport("pytest-junit", fx("test-reports", "pytest-xunit1-collect-error.xml"), { workRoot: "/m/work" }));
    expect([...r.tests]).toEqual([["tests/test_broken.py > tests.test_broken", "failed"]]);
    expect(r.success).toBe(false);
  });
  it("без file= (xunit2 по подразбиране) → schema с подсказка; счупен XML → xml; DOCTYPE отказан", () => {
    const x2 = fx("test-reports", "pytest-xunit1.xml").replace(/ file="[^"]*"/g, "");
    const a = parseReport("pytest-junit", x2, { workRoot: "/m/work" });
    expect(a.valid ? "valid" : [a.error, a.detail]).toEqual(["schema", expect.stringContaining("junit_family=xunit1")]);
    const b = parseReport("pytest-junit", "<testsuites><testsuite>", { workRoot: "/m/work" });
    expect(b.valid ? "valid" : b.error).toBe("xml");
    const c = parseReport("pytest-junit", '<!DOCTYPE x [<!ENTITY a "b">]><testsuites/>', { workRoot: "/m/work" });
    expect(c.valid ? "valid" : c.error).toBe("xml");
  });
  it("абсолютен път под корена → относителен; ентитита в атрибутите; повторен тест → най-лошият статус", () => {
    const xml = '<?xml version="1.0"?><testsuites><testsuite errors="0" failures="0">'
      + '<testcase classname="tests.test_a" name="test_x[a&amp;b &lt;1&gt;]" file="/m/work/tests/test_a.py" time="0.5"/>'
      + '<testcase classname="tests.test_a" name="test_y" file="tests/test_a.py"/>'
      + '<testcase classname="tests.test_a" name="test_y" file="tests/test_a.py"><error message="teardown"/></testcase>'
      + "</testsuite></testsuites>";
    const r = pytestJunitToTestReport(xml, "/m/work");
    if (!r.ok) throw new Error(r.detail);
    expect(r.report.tests.map((t) => [t.file, t.name, t.status, t.duration_ms])).toEqual([["tests/test_a.py", "test_x[a&b <1>]", "passed", 500], ["tests/test_a.py", "test_y", "failed", undefined]]);
    expect(r.report.success).toBe(false);
  });
  it("failures/errors в testsuite без testcase пак правят success=false", () => {
    const r = ok(parseReport("pytest-junit", '<testsuite errors="1" failures="0"></testsuite>', { workRoot: "/m/work" }));
    expect([r.total, r.success]).toEqual([0, false]);
  });
});

describe("go test -json → TestReport (D-680, реален go 1.27.4)", () => {
  it("пакет спрямо модула, подтестове, skip, провал", () => {
    const r = ok(parseReport("go-test-json", fx("test-reports", "go-test.jsonl"), { workRoot: "/m/work", goModule: "example.com/shop" }));
    expect(r.success).toBe(false);
    expect(r.tests.get("cart > TestApplies10PercentOver50")).toBe("failed");
    expect(r.tests.get("cart > TestNoDiscountAtExactly50")).toBe("passed");
    expect(r.tests.get("cart > TestSkipped")).toBe("skipped");
    expect(r.tests.get("money > TestFormat > positive")).toBe("passed");
    expect(r.tests.get("money > TestFormat")).toBe("passed");
    expect([...r.tests.values()].filter((s) => s === "failed")).toHaveLength(1);
  });
  it("счупен build → success=false (тестовете на пакета липсват → D1 ги вижда)", () => {
    const r = ok(parseReport("go-test-json", fx("test-reports", "go-test-build-fail.jsonl"), { workRoot: "/m/work", goModule: "example.com/shop" }));
    expect(r.success).toBe(false);
    expect([...r.tests.keys()].some((k) => k.startsWith("broken"))).toBe(false);
  });
  it("коренов пакет → '.', без модул → пълният път; тест без край → failed; не-JSON редове се пропускат", () => {
    const lines = [
      '{"Action":"run","Package":"example.com/shop","Test":"TestRoot"}',
      '{"Action":"pass","Package":"example.com/shop","Test":"TestRoot","Elapsed":0.25}',
      '{"Action":"run","Package":"example.com/shop","Test":"TestHang"}',
      "panic: something printed outside JSON",
      '{"Action":"pass","Package":"example.com/shop","Elapsed":1}',
    ].join("\n");
    const r = goTestJsonToTestReport(lines, { goModule: "example.com/shop" });
    if (!r.ok) throw new Error(r.detail);
    expect(r.report.tests.map((t) => [t.file, t.name, t.status, t.duration_ms])).toEqual([[".", "TestRoot", "passed", 250], [".", "TestHang", "failed", undefined]]);
    expect(r.report.success).toBe(false);
    const n = goTestJsonToTestReport(lines, {});
    if (!n.ok) throw new Error(n.detail);
    expect(n.report.tests[0]?.file).toBe("example.com/shop");
  });
  it("нито едно събитие → schema", () => {
    const r = parseReport("go-test-json", "not json\n", { workRoot: "/m/work" });
    expect(r.valid ? "valid" : r.error).toBe("schema");
  });
});

describe("libtest JSON → TestReport (D-680, [НП] реален cargo 1.100.0 с RUSTC_BOOTSTRAP=1)", () => {
  it("цел от реда Running на cargo; модул; ignored; doc-тестове; провал", () => {
    const r = ok(parseReport("libtest-json", fx("test-reports", "libtest.out"), { workRoot: "/m/work" }));
    expect(r.success).toBe(false);
    expect(r.tests.get("src/lib.rs > tests > applies_10_percent_over_50")).toBe("failed");
    expect(r.tests.get("src/lib.rs > tests > adds")).toBe("passed");
    expect(r.tests.get("src/lib.rs > tests > ignored_one")).toBe("skipped");
    expect(r.tests.get("tests/cart.rs > adds")).toBe("passed");
    expect(r.tests.get("doc-tests shop > src/lib.rs - add (line 2)")).toBe("passed");
    expect(r.total).toBe(6);
  });
  it("без редове Running → suite-<n>; започнат и недовършен тест или suite → failed", () => {
    const raw = ['{ "type": "suite", "event": "started", "test_count": 2 }', '{ "type": "test", "event": "started", "name": "a::b" }', '{ "type": "test", "event": "started", "name": "c" }', '{ "type": "test", "name": "c", "event": "ok" }'].join("\n");
    const r = libtestToTestReport(raw);
    if (!r.ok) throw new Error(r.detail);
    expect(r.report.tests.map((t) => [t.file, ...t.suite, t.name, t.status])).toEqual([["suite-1", "a", "b", "failed"], ["suite-1", "c", "passed"]]);
    expect(r.report.success).toBe(false);
  });
});
