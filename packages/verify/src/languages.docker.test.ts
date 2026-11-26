import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mandatVerify } from "./cli.js";
import { sh } from "./git-fixture.test-helper.js";

// E10 languages (D-680…D-688): shop-py and shop-go in their language images (`pnpm mandat images build --lang python,go`):
// nothing installed, the real pytest / go test in the sandbox (--network none), the real report adapters, real mutants.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-lang-home-"));

function repoFrom(fixture: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-lang-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures", fixture), seed, { recursive: true, filter: (s) => !s.includes("__pycache__") });
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const remote = path.join(root, "shop.git");
  sh(root, "clone", "-q", "--bare", seed, remote);
  const repo = path.join(root, "repo");
  sh(root, "clone", "-q", remote, repo);
  sh(repo, "checkout", "-q", "-b", "fix/discount");
  return { root, remote, repo };
}
const edit = (repo: string, f: string, fn: (s: string) => string) => writeFileSync(path.join(repo, f), fn(readFileSync(path.join(repo, f), "utf8")));

async function verify(f: { remote: string; repo: string }) {
  let out = "";
  const io = { stdout: (s: string) => (out += s), stderr: () => undefined, env: process.env, cwd: f.repo };
  const code = await mandatVerify(["--repo", f.repo, "--remote", `file://${f.remote}`, "--home", home, "--json", "--external", "--type", "bugfix"], io, { repoRoot });
  const o = JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as { verdict?: { result: string; reasons: string[]; evidence: { detector: string; status: string; summary: string }[] } };
  if (process.env.MANDAT_DEBUG_LANGS) process.stderr.write(out + "\n");
  return { code, result: o.verdict?.result, reasons: o.verdict?.reasons ?? [], evidence: o.verdict?.evidence ?? [] };
}
const status = (e: { detector: string; status: string }[], d: string) => e.find((x) => x.detector === d)?.status;

describe("езици (docker, D-680…D-688)", () => {
  it("Python (shop-py, pytest 9.2.0): честна поправка → VERIFIED (D11 убива мутантите); изтрит тест → FAILED D2:missing_test", async () => {
    const ok = repoFrom("shop-py");
    edit(ok.repo, "src/shop/cart.py", (s) => s.replace("DISCOUNT_THRESHOLD_CENTS = 50000\n", "DISCOUNT_THRESHOLD_CENTS = 5000\n"));
    const a = await verify(ok);
    expect([a.result, a.code, a.reasons]).toEqual(["VERIFIED", 0, []]);
    expect(a.evidence.find((e) => e.detector === "D1.base_tests")?.summary).toBe("20/20");
    expect(status(a.evidence, "D11.mutation")).toBe("pass");
    const bad = repoFrom("shop-py");
    edit(bad.repo, "tests/test_cart.py", (s) => s.replace("    def test_applies_10_percent_over_50(self):\n        assert discount_cents(10000) == 1000\n\n", ""));
    const b = await verify(bad);
    expect(b.result).toBe("FAILED");
    expect(b.reasons).toContain("D2:missing_test:tests/test_cart.py > TestCart > test_applies_10_percent_over_50");
    rmSync(ok.root, { recursive: true, force: true });
    rmSync(bad.root, { recursive: true, force: true });
  }, 600_000);

  it("Python: поправка, която чупи граничен тест → FAILED D1:regression; test_cart с грешка при събиране → FAILED", async () => {
    const partial = repoFrom("shop-py");
    edit(partial.repo, "src/shop/cart.py", (s) => s.replace("= 50000\n", "= 5000\n").replace("if subtotal > DISCOUNT", "if subtotal >= DISCOUNT"));
    const p = await verify(partial);
    expect(p.result).toBe("FAILED");
    expect(p.reasons).toContain("D1:regression:tests/test_cart.py > TestCart > test_no_discount_at_exactly_50");
    const broken = repoFrom("shop-py");
    edit(broken.repo, "src/shop/cart.py", (s) => s.replace("from shop.money import add_cents, mul_cents\n", "from shop.money import add_cents, mul_cents, nope\n"));
    const r = await verify(broken);
    expect(r.result).toBe("FAILED");
    expect(r.reasons.some((x) => x.startsWith("D1:regression:"))).toBe(true);
    rmSync(partial.root, { recursive: true, force: true });
    rmSync(broken.root, { recursive: true, force: true });
  }, 600_000);

  it("Go (shop-go, go 1.27.4): честна поправка → VERIFIED; изтрит тест → FAILED D2:missing_test", async () => {
    const ok = repoFrom("shop-go");
    edit(ok.repo, "cart/cart.go", (s) => s.replace("const discountThresholdCents = 50000\n", "const discountThresholdCents = 5000\n"));
    const a = await verify(ok);
    expect([a.result, a.code, a.reasons]).toEqual(["VERIFIED", 0, []]);
    expect(status(a.evidence, "D11.mutation")).toBe("pass");
    const bad = repoFrom("shop-go");
    edit(bad.repo, "cart/cart_test.go", (s) => s.replace(/func TestApplies10PercentOver50\(t \*testing\.T\) \{[\s\S]*?\n\}\n\n/, ""));
    const b = await verify(bad);
    expect(b.result).toBe("FAILED");
    expect(b.reasons).toContain("D2:missing_test:cart > TestApplies10PercentOver50");
    rmSync(ok.root, { recursive: true, force: true });
    rmSync(bad.root, { recursive: true, force: true });
  }, 600_000);
});
