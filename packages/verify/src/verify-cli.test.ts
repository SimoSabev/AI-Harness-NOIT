import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mandatVerify } from "./cli.js";
import { sh } from "./git-fixture.test-helper.js";
import { M_TITLE, okDocker, simRunTests } from "./shop-sim.test-helper.js";
import type { TestProcedureInput } from "./test-procedure.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const M = `tests/cart.spec.ts > cart > ${M_TITLE}`;
const IMAGES = { sandbox: "s:t", gate: "g:t", proxy: "p:t" };

function demo(mutateBase?: (dir: string) => void): { remote: string; repo: string; home: string; root: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-vcli-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
  mutateBase?.(seed);
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const remote = path.join(root, "demo-shop.git");
  sh(root, "clone", "-q", "--bare", seed, remote);
  const repo = path.join(root, "repo");
  sh(root, "clone", "-q", remote, repo);
  sh(repo, "checkout", "-q", "-b", "fix/discount");
  return { remote, repo, home: path.join(root, "home"), root };
}
const edit = (repo: string, f: string, fn: (s: string) => string) => writeFileSync(path.join(repo, f), fn(readFileSync(path.join(repo, f), "utf8")));
const deleteM = (s: string) => s.replace(/ {2}it\("applies 10% over 50"[\s\S]*?\n {2}\}\);\n/, "");
const fixCode = (s: string) => s.replace("= 50000;", "= 5000;");

async function verify(f: { remote: string; repo: string; home: string }, extra: string[] = [], over?: (i: TestProcedureInput, raw: string) => string) {
  let out = "";
  let err = "";
  const io = { stdout: (s: string) => (out += s), stderr: (s: string) => (err += s), env: {}, cwd: f.repo };
  const code = await mandatVerify(["--repo", f.repo, "--remote", `file://${f.remote}`, "--home", f.home, ...extra], io, {
    docker: okDocker, images: IMAGES, verify: { runTests: simRunTests(over), ipv6Sysctl: true, infraUser: "1000:1000" },
  });
  return { code, out, err };
}

describe("mandat-verify (т. 5.7; verify-cli без Docker, тестовете — симулирани)", () => {
  it("изтрит тест M (комит) → FAILED D2:missing_test:<M>, exit 20, level 1 (external cap)", async () => {
    const f = demo();
    edit(f.repo, "tests/cart.spec.ts", deleteM);
    sh(f.repo, "commit", "-qam", "drop test");
    const r = await verify(f, ["--external", "--type", "bugfix"]);
    expect(r.code).toBe(20);
    expect(r.out).toContain(`VERDICT: FAILED`);
    expect(r.out).toContain(`D2:missing_test:${M}`);
    expect(r.out).toMatch(/^level: [01]/m);
    expect(r.out).toMatch(/^base: [0-9a-f]{12} \(trusted file:\/\/.* main\)$/m);
  });
  it("F12: изтрит с rm без git rm → пак FAILED (missing_test)", async () => {
    const f = demo();
    rmSync(path.join(f.repo, "tests/cart.spec.ts"));
    const r = await verify(f, ["--external", "--json"]);
    expect(r.code).toBe(20);
    const j = JSON.parse(r.out) as { verdict: { evidence: { detector: string; data: { findings?: { cls: string; id: string }[] } }[] } };
    const d2 = j.verdict.evidence.find((e) => e.detector === "D2.inventory");
    expect(d2?.data.findings).toContainEqual({ cls: "missing_test", id: M });
  });
  it("F15: без --type изтрит тест → FAILED; --type feature (may_change_tests) → UNKNOWN", async () => {
    const f = demo();
    edit(f.repo, "tests/cart.spec.ts", deleteM);
    expect((await verify(f, ["--external"])).code).toBe(20);
    const g = demo();
    edit(g.repo, "tests/cart.spec.ts", deleteM);
    const r = await verify(g, ["--type", "feature"]);
    expect(r.code).toBe(10);
    expect(r.out).toContain("D2:missing_test");
  });
  it("честна поправка → VERIFIED, exit 0, „level: 1 (external cap“", async () => {
    const f = demo();
    edit(f.repo, "src/cart.ts", fixCode);
    const r = await verify(f, ["--external", "--type", "bugfix"]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toContain("VERDICT: VERIFIED");
    expect(r.out).toMatch(/^level: 1 \(external cap/m);
    expect(r.out).toMatch(/^ledger: seq 1\.\.1$/m);
    const ledger = readFileSync(path.join(f.home, "ledger.jsonl"), "utf8");
    expect(ledger).toContain('"kind":"external_verdict"');
  });
  it("отслабен тест (toBe(1000) → toBe(0) без промяна в src) → FAILED D2:weakened:<M>", async () => {
    const f = demo();
    edit(f.repo, "tests/cart.spec.ts", (s) => s.replace("expect(discountCents(10000)).toBe(1000);", "expect(discountCents(10000)).toBe(0);"));
    const r = await verify(f, ["--external"]);
    expect(r.code).toBe(20);
    expect(r.out).toContain(`D2:weakened:${M}`);
  });
  // v5 E9б (5.2): D5 — a person's hidden tests, copied into tree B only; the agent never has them
  const hiddenDir = () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "mandat-hidden-"));
    writeFileSync(path.join(d, "cart.spec.ts"), `import { describe, expect, it } from "vitest";\nimport { discountCents } from "../../src/cart";\ndescribe("hidden", () => {\n  it("${M_TITLE}", () => {\n    expect(discountCents(10000)).toBe(1000);\n  });\n});\n`);
    return d;
  };
  it("D5: --hidden с честна поправка → VERIFIED, D5 pass; скритите тестове не влизат в D2", async () => {
    const f = demo();
    edit(f.repo, "src/cart.ts", fixCode);
    const r = await verify(f, ["--external", "--type", "bugfix", "--hidden", hiddenDir(), "--json"]);
    const o = JSON.parse(r.out.trim()) as { verdict: { result: string; evidence: { detector: string; status: string; agent_visible: boolean }[] } };
    expect(o.verdict.result).toBe("VERIFIED");
    expect(o.verdict.evidence.find((e) => e.detector === "D5.hidden")).toMatchObject({ status: "pass", agent_visible: false });
    expect(o.verdict.evidence.find((e) => e.detector === "D2.inventory")?.status).toBe("pass");
  });
  it("D5: промяна, която не поправя бъга (видимите тестове не се пипат) → FAILED D5:hidden_fail:<хеш>, без името на теста", async () => {
    const f = demo();
    edit(f.repo, "README.md", (s) => `${s}\nA note.\n`);
    const r = await verify(f, ["--external", "--hidden", hiddenDir(), "--json"]);
    const o = JSON.parse(r.out.trim()) as { verdict: { result: string; reasons: string[] } };
    expect(o.verdict.result).toBe("FAILED");
    expect(o.verdict.reasons.some((x) => /^D5:hidden_fail:h[0-9a-f]{8}$/.test(x))).toBe(true);
    expect(o.verdict.reasons.join(" ")).not.toContain(M_TITLE);
  });
  // v5 E9б (5.2): D8 — the project's lint/typecheck on base and B (the simulator: a "LINT_ERROR" / "TYPE_ERROR" marker in src)
  const d8Of = async (f: ReturnType<typeof demo>, extra: string[]) => {
    const r = await verify(f, ["--external", "--type", "bugfix", "--lint", "npm run lint", "--typecheck", "npx tsc --noEmit", "--json", ...extra]);
    return JSON.parse(r.out.trim()) as { verdict: { result: string; reasons: string[]; evidence: { detector: string; status: string; data: Record<string, unknown> }[] } };
  };
  it("D8: честна поправка → VERIFIED, D8 pass; lint грешка в промяната → FAILED D8:lint_fail", async () => {
    const ok = demo();
    edit(ok.repo, "src/cart.ts", fixCode);
    const a = await d8Of(ok, []);
    expect([a.verdict.result, a.verdict.evidence.find((e) => e.detector === "D8.static")?.status]).toEqual(["VERIFIED", "pass"]);
    const bad = demo();
    edit(bad.repo, "src/cart.ts", (s) => `${fixCode(s)}\n// LINT_ERROR\n`);
    const b = await d8Of(bad, []);
    expect(b.verdict.result).toBe("FAILED");
    expect(b.verdict.reasons).toContain("D8:lint_fail:-");
  });
  it("D8: typecheck, който е червен още на base, не се брои срещу агента", async () => {
    const f = demo((dir) => writeFileSync(path.join(dir, "src/money.ts"), `${readFileSync(path.join(dir, "src/money.ts"), "utf8")}\n// TYPE_ERROR\n`));
    edit(f.repo, "src/cart.ts", fixCode);
    const r = await d8Of(f, []);
    expect(r.verdict.result).toBe("VERIFIED");
    expect(r.verdict.evidence.find((e) => e.detector === "D8.static")?.data).toMatchObject({ skipped: ["typecheck"] });
  });
  it("--json: един ред = VerifyOutcome + exit", async () => {
    const f = demo();
    edit(f.repo, "src/cart.ts", fixCode);
    const r = await verify(f, ["--external", "--json"]);
    const j = JSON.parse(r.out.trim()) as { exit: number; effective_level: number; verdict: { mode: string; result: string } };
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(j).toMatchObject({ exit: 0, effective_level: 1, verdict: { mode: "external", result: "VERIFIED" } });
  });
  it("празна промяна → UNKNOWN EXPORT:empty_change:-; без --remote → POLICY:base_untrusted:no_remote", async () => {
    const f = demo();
    const e = await verify(f, ["--external"]);
    expect(e.code).toBe(10);
    expect(e.out).toContain("EXPORT:empty_change:-");
    let out = "";
    const io = { stdout: (s: string) => (out += s), stderr: () => undefined, env: {}, cwd: f.repo };
    expect(await mandatVerify(["--repo", f.repo, "--home", f.home], io, { docker: okDocker, images: IMAGES, verify: { ipv6Sysctl: true, infraUser: "1:1" } })).toBe(10);
    expect(out).toContain("POLICY:base_untrusted:no_remote");
    expect(out).toContain("base: untrusted");
  });
  it("агентът на main → UNKNOWN on_default_branch", async () => {
    const f = demo();
    sh(f.repo, "checkout", "-q", "main");
    edit(f.repo, "src/cart.ts", fixCode);
    sh(f.repo, "commit", "-qam", "fix on main");
    const r = await verify(f, ["--external"]);
    expect(r.code).toBe(10);
    expect(r.out).toContain("POLICY:base_untrusted:on_default_branch");
  });
  it("употреба → 2; docker недостъпен → 3", async () => {
    const io = { stdout: () => undefined, stderr: () => undefined, env: {}, cwd: "/" };
    expect(await mandatVerify([], io)).toBe(2);
    expect(await mandatVerify(["--repo", "/x", "--type", "nope"], io)).toBe(2);
    expect(await mandatVerify(["--repo", "/x", "--bogus"], io)).toBe(2);
    expect(await mandatVerify(["--repo"], io)).toBe(2);
    const down = { run: () => Promise.resolve({ exitCode: 1, timedOut: false }) };
    expect(await mandatVerify(["--repo", "/x", "--home", mkdtempSync(path.join(os.tmpdir(), "mv-"))], io, { docker: down, images: IMAGES })).toBe(3);
  });
});

describe("k1-base-policy (К-1)", () => {
  it("head разширява allowed_paths в .mandat.yml → ползва се base; UNKNOWN D3 (config)", async () => {
    const f = demo();
    edit(f.repo, ".mandat.yml", (s) => s.replace('allowed_paths: ["src/**"]', 'allowed_paths: ["**"]'));
    edit(f.repo, "src/cart.ts", fixCode);
    const r = await verify(f, ["--external", "--type", "bugfix"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/D3:(config|protected)[^,\n]*\.mandat\.yml/);
  });
  it("липсваща политика на base → UNKNOWN POLICY:missing:.mandat.yml", async () => {
    const f = demo((d) => rmSync(path.join(d, ".mandat.yml")));
    edit(f.repo, "src/cart.ts", fixCode);
    const r = await verify(f, ["--external"]);
    expect(r.code).toBe(10);
    expect(r.out).toContain("POLICY:missing:.mandat.yml");
  });
  it("политика с mocha → UNKNOWN INFRA:unsupported_runner (D-301: jest, pnpm, yarn вече вървят); изисква D5 → FAILED INFRA:detector_missing:D5", async () => {
    const f = demo((d) => writeFileSync(path.join(d, ".mandat.yml"), readFileSync(path.join(d, ".mandat.yml"), "utf8").replace("framework: vitest", "framework: mocha")));
    edit(f.repo, "src/cart.ts", fixCode);
    const r = await verify(f, ["--external"]);
    expect(r.code).toBe(10);
    expect(r.out).toContain("INFRA:unsupported_runner:npm/mocha");
    const g = demo((d) => writeFileSync(path.join(d, ".mandat.yml"), readFileSync(path.join(d, ".mandat.yml"), "utf8").replace("required_detectors: [D1, D2, D3, D4, D10]", "required_detectors: [D1, D2, D5]")));
    edit(g.repo, "src/cart.ts", fixCode);
    const q = await verify(g, ["--external"]);
    expect(q.code).toBe(20);
    expect(q.out).toContain("INFRA:detector_missing:D5");
  });
});

describe("verify-no-write", () => {
  it("git status, индексът и .git са непроменени след mandat-verify", async () => {
    const f = demo();
    edit(f.repo, "src/cart.ts", fixCode);
    writeFileSync(path.join(f.repo, "new.txt"), "untracked\n");
    const status = () => sh(f.repo, "status", "--porcelain");
    const idx = () => createHash("sha256").update(readFileSync(path.join(f.repo, ".git/index"))).digest("hex");
    const before = { s: status(), i: idx() };
    const marker = path.join(f.root, "marker");
    writeFileSync(marker, "");
    await new Promise((r) => setTimeout(r, 20));
    await verify(f, ["--external"]);
    // find first: `git status` itself may refresh the index
    expect(execFileSync("find", [path.join(f.repo, ".git"), "-newer", marker], { encoding: "utf8" }).trim()).toBe("");
    expect(idx()).toBe(before.i);
    expect(status()).toBe(before.s);
  });
});

describe("retry-same-tree (S27)", () => {
  it("ранен FAILED по D1 за същото дърво → новата присъда е най-много UNKNOWN D1:flaky_history", async () => {
    const f = demo();
    edit(f.repo, "src/cart.ts", fixCode);
    // first run: the base test "no discount under 50" fails in A (a flake) → FAILED D1:regression
    const r1 = await verify(f, ["--external"], (i, raw) => {
      if (i.tree !== "a") return raw;
      const j = JSON.parse(raw) as { testResults: { assertionResults: { title: string; status: string }[] }[]; success: boolean };
      for (const t of j.testResults) for (const a of t.assertionResults) if (a.title === "no discount under 50") a.status = "failed";
      j.success = false;
      return JSON.stringify(j);
    });
    expect(r1.code).toBe(20);
    expect(r1.out).toContain("D1:regression");
    const r2 = await verify(f, ["--external"]);
    expect(r2.code).toBe(10);
    expect(r2.out).toContain("D1:flaky_history");
  });
});
