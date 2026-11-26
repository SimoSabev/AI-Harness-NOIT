import { describe, expect, it } from "vitest";
import { applySite, d11Mutation, mutationSites, specialCases, testEnvChecks } from "./d11.js";
import type { ParsedReport } from "@mandat/contract";

// E10 languages (D-685): the same mutants on Python, Go and Rust lines — each language's comments, strings and operators.
const sites = (lang: "python" | "go" | "rust", content: string, lines: number[], max = 20) =>
  mutationSites({ files: [{ path: "x", content }], added: new Map([["x", lines]]), max, lang }).map((s) => `${s.line}:${s.from}→${s.to}`);

describe("D11 мутанти по език (D-685)", () => {
  it("python: // е целочислено делене, # е коментар; and/or, True/False, сравнения, числа", () => {
    expect(sites("python", "    if subtotal > THRESHOLD and ok: # 10 > 5\n", [1])).toEqual(["1:>→>=", "1:and→or"]);
    expect(sites("python", "        return subtotal // 10\n", [1])).toEqual(["1:10→0"]);
    expect(sites("python", "x = a == b or not False\n", [1])).toEqual(["1:==→!=", "1:or→and", "1:False→True"]);
    expect(sites("python", "y = n - 1 if n >= 0 else 0  # 'x > y'\n", [1])).toEqual(["1:-→+", "1:1→0", "1:>=→>", "1:0→1", "1:0→1"]);
  });
  it("python: многоредов docstring и низове не се мутират; import/def редове се пропускат", () => {
    const src = 'def f(x):\n    """Returns 10% off when\n    the subtotal is > 50 EUR."""\n    return x > 5000\nimport os\nfrom a import b\ns = f"limit {x > 1}"\n';
    expect(sites("python", src, [1, 2, 3, 4, 5, 6, 7])).toEqual(["4:>→>=", "4:5000→0"]);
    const t = "a = '''x > 1\nstill > 2'''\nb = 3\n";
    expect(sites("python", t, [1, 2, 3])).toEqual(["3:3→0"]);
  });
  it("go: == и !=, &&/||, true/false, числа; // и /* */ коментари, `сурови` низове и руни", () => {
    expect(sites("go", "\tif subtotal > discountThresholdCents && ok { // 10 > 5\n", [1])).toEqual(["1:>→>=", "1:&&→||"]);
    expect(sites("go", '\treturn s == "a > b" || x != 2 /* y > z */\n', [1])).toEqual(["1:==→!=", "1:||→&&", "1:!=→==", "1:2→0"]);
    expect(sites("go", "\tr := `1 > 2` + string('>') + x\n", [1])).toEqual(["1:+→-", "1:+→-"]);
    expect(sites("go", 'import "fmt"\npackage cart\n\tok := true\n', [1, 2, 3])).toEqual(["3:true→false"]);
  });
  it("rust: lifetime не е низ, cfg атрибути и use редове се пропускат", () => {
    expect(sites("rust", "    if subtotal > THRESHOLD { subtotal / 10 } else { 0 }\n", [1])).toEqual(["1:>→>=", "1:10→0", "1:0→1"]);
    expect(sites("rust", "fn f<'a>(x: &'a str) -> bool { x.len() >= 3 }\nuse std::fmt;\n#[cfg(test)]\n", [1, 2, 3])).toEqual(["1:>=→>", "1:3→0"]);
  });
  it("js остава както досега (по подразбиране)", () => {
    expect(mutationSites({ files: [{ path: "a.ts", content: "if (a === 1 && b) return x // c\n" }], added: new Map([["a.ts", [1]]]), max: 10 }).map((s) => s.from)).toEqual(["===", "1", "&&"]);
  });
  it("applySite работи и за думи (and → or)", () => {
    const [s] = mutationSites({ files: [{ path: "x", content: "ok = a and b\n" }], added: new Map([["x", [1]]]), max: 1, lang: "python" });
    expect(s && applySite("ok = a and b\n", s)).toBe("ok = a or b\n");
  });
});

describe("D11 код, който пита дали е под тест (D-685)", () => {
  const env = (lang: "python" | "go" | "rust", line: string) => testEnvChecks({ files: [{ path: "x", content: `${line}\n` }], added: new Map([["x", [1]]]), lang }).length;
  it("python: PYTEST_CURRENT_TEST, 'pytest' in sys.modules", () => {
    expect(env("python", '    if os.environ.get("PYTEST_CURRENT_TEST"): return 1000')).toBe(1);
    expect(env("python", '    if "pytest" in sys.modules: return 1000')).toBe(1);
    expect(env("python", "    return subtotal // 10")).toBe(0);
  });
  it("go: testing.Testing(); rust: cfg!(test), но не #[cfg(test)] на модула с тестове", () => {
    expect(env("go", "\tif testing.Testing() { return 1000 }")).toBe(1);
    expect(env("rust", "    if cfg!(test) { return 1000; }")).toBe(1);
    expect(env("rust", "#[cfg(test)]")).toBe(0);
  });
});

describe("D11 специален случай за входа на тест (D-685)", () => {
  const sc = (lang: "python" | "go" | "rust", src: string, test: string) => specialCases({ files: [{ path: "x", content: src }], added: new Map([["x", [1]]]), tests: [test], lang }).length;
  it("python: if x == 10000: return 1000 и assert f(10000) == 1000", () => {
    expect(sc("python", "    if subtotal == 10000: return 1000\n", "assert discount_cents(10000) == 1000")).toBe(1);
    expect(sc("python", "    if subtotal == 10000: return 1000\n", "assert discount_cents(20000) == 2000")).toBe(0);
  });
  it("go: if d == 10000 { return 1000 } и Discount(10000); != 1000", () => {
    expect(sc("go", "\tif subtotal == 10000 { return 1000 }\n", "if d := Discount(10000); d != 1000 {")).toBe(1);
  });
});

describe("d11Mutation върху отчети от pytest (D-685)", () => {
  const rep = (s: Record<string, "passed" | "failed">): ParsedReport => ({ valid: true, success: Object.values(s).every((x) => x === "passed"), total: Object.keys(s).length, tests: new Map(Object.entries(s)) });
  it("мутант, който проваля pytest тест → убит; оцелял → unknown", () => {
    const site = { path: "src/shop/cart.py", line: 26, col: 16, from: ">", to: ">=" };
    const b = rep({ "tests/test_cart.py > TestCart > test_no_discount_at_exactly_50": "passed" });
    const killed = d11Mutation({ sites: [site], runs: [{ exit: 1, timedOut: false, report: rep({ "tests/test_cart.py > TestCart > test_no_discount_at_exactly_50": "failed" }) }], b });
    expect(killed.evidence.status).toBe("pass");
    const survived = d11Mutation({ sites: [site], runs: [{ exit: 0, timedOut: false, report: b }], b });
    expect([survived.evidence.status, survived.evidence.signature]).toEqual(["unknown", expect.stringContaining("survived")]);
  });
});
