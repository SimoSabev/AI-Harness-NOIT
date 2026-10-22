import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mandatVerify } from "./cli.js";
import { sh } from "./git-fixture.test-helper.js";

// D-301: pnpm (lockfile v9) + jest and yarn v1 + vitest — real lockfiles, real install through the gate, real tests,
// real mutants (D-300) in the real sandbox.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-runners-home-"));

function repoFrom(fixture: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-runners-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures", fixture), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
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

async function verify(f: { remote: string; repo: string }, extra: string[]) {
  let out = "";
  const io = { stdout: (s: string) => (out += s), stderr: () => undefined, env: process.env, cwd: f.repo };
  const code = await mandatVerify(["--repo", f.repo, "--remote", `file://${f.remote}`, "--home", home, "--json", ...extra], io, { repoRoot });
  const o = JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as { verdict?: { result: string; reasons: string[]; evidence: { detector: string; status: string; summary: string }[] } };
  if (process.env.MANDAT_DEBUG_RUNNERS) process.stderr.write(out + "\n");
  return { code, v: { result: o.verdict?.result, reasons: o.verdict?.reasons ?? [], evidence: o.verdict?.evidence ?? [] } };
}

describe("runners (docker, D-301)", () => {
  // E8и (D-358): yarn berry (yarn 4 lockfile) and bun (bun.lock) on the same shop
  for (const [fixture, src, test] of [["shop-pnpm-jest", "src/cart.js", "tests/cart.spec.js"], ["shop-yarn-vitest", "src/cart.ts", "tests/cart.spec.ts"], ["shop-yarn-berry", "src/cart.ts", "tests/cart.spec.ts"], ["shop-bun-vitest", "src/cart.ts", "tests/cart.spec.ts"]] as const) {
    it(`${fixture}: честна поправка → VERIFIED; изтрит тест → FAILED D2:missing_test`, async () => {
      const ok = repoFrom(fixture);
      edit(ok.repo, src, (s) => s.replace("= 50000;", "= 5000;"));
      const a = await verify(ok, ["--external", "--type", "bugfix"]);
      expect([a.v.result, a.code]).toEqual(["VERIFIED", 0]);
      expect(a.v.evidence.find((e) => e.detector === "D11.mutation")?.status).toBe("pass"); // D-300 on these runners too
      const bad = repoFrom(fixture);
      edit(bad.repo, test, (s) => s.replace(/ {2}it\("applies 10% over 50"[\s\S]*?\n {2}\}\);\n/, ""));
      const b = await verify(bad, ["--external", "--type", "bugfix"]);
      expect(b.v.result).toBe("FAILED");
      expect(b.v.reasons.some((r) => r.startsWith("D2:missing_test:"))).toBe(true);
      rmSync(ok.root, { recursive: true, force: true });
      rmSync(bad.root, { recursive: true, force: true });
    }, 600_000);
  }

  it("monorepo-pnpm (E8и, D-358): честна поправка в пакет cart → VERIFIED; изтрит тест в пакет receipt → FAILED D2:missing_test", async () => {
    const ok = repoFrom("monorepo-pnpm");
    edit(ok.repo, "packages/cart/src/cart.ts", (s) => s.replace("= 50000;", "= 5000;"));
    const a = await verify(ok, ["--external", "--type", "bugfix"]);
    expect([a.v.result, a.code]).toEqual(["VERIFIED", 0]);
    expect(a.v.evidence.find((e) => e.detector === "D10.lockfile")?.status).toBe("n/a");
    const bad = repoFrom("monorepo-pnpm");
    edit(bad.repo, "packages/cart/src/cart.ts", (s) => s.replace("= 50000;", "= 5000;"));
    edit(bad.repo, "packages/receipt/tests/receipt.spec.ts", (s) => s.replace(/ {2}it\("pads cents"[\s\S]*?\n {2}\}\);\n/, ""));
    const b = await verify(bad, ["--external", "--type", "bugfix"]);
    expect(b.v.result).toBe("FAILED");
    expect(b.v.reasons.some((r) => r.startsWith("D2:missing_test:") && r.includes("pads cents"))).toBe(true);
    rmSync(ok.root, { recursive: true, force: true });
    rmSync(bad.root, { recursive: true, force: true });
  }, 600_000);
});
