import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MandatError } from "@mandat/contract";
import { CLEAN_GIT_CONFIG } from "@mandat/export";

/** D-115: exactly these 10 files. */
export const SHOP_FILES = [
  "package.json", "package-lock.json", "src/money.ts", "src/cart.ts", "tests/money.spec.ts", "tests/cart.spec.ts",
  "vitest.config.ts", "tsconfig.json", ".gitignore", "README.md",
] as const;

function git(cwd: string, home: string, args: string[], extraEnv: Record<string, string> = {}): string {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, LANG: "C.UTF-8",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_ATTR_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", ...extraEnv,
  };
  const flags = [...CLEAN_GIT_CONFIG, "core.fileMode=false", "init.defaultBranch=main"].flatMap((f) => ["-c", f]);
  const r = spawnSync("git", [...flags, ...args], { cwd, env, encoding: "utf8" });
  if (r.status !== 0) throw new MandatError("E_FIXTURE_MISMATCH", `git ${args[0]} failed: ${r.stderr.slice(0, 300)}`);
  return r.stdout.trim();
}

/**
 * D-050 / D-133: deterministic mirror of fixtures/shop in <home>/mirrors/shop.git.
 * Same sha → "(unchanged)"; different sha → E_FIXTURE_MISMATCH unless force → "(recreated)".
 */
export function buildShopFixture(o: { repoRoot: string; mandatHome: string; force: boolean }): { sha: string; state: "created" | "unchanged" | "recreated" } {
  const src = path.join(o.repoRoot, "fixtures", "shop");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-fixture-"));
  try {
    const work = path.join(tmp, "shop");
    for (const f of SHOP_FILES) {
      const to = path.join(work, f);
      mkdirSync(path.dirname(to), { recursive: true });
      const content = readFileSync(path.join(src, f), "utf8").replace(/\r\n/g, "\n");
      writeFileSync(to, content);
      chmodSync(to, 0o644);
    }
    const date = "@1792454400 +0000";
    const who = { GIT_AUTHOR_NAME: "Mandat Fixtures", GIT_COMMITTER_NAME: "Mandat Fixtures", GIT_AUTHOR_EMAIL: "fixtures@mandat.invalid", GIT_COMMITTER_EMAIL: "fixtures@mandat.invalid", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
    git(work, tmp, ["init", "-q"]);
    git(work, tmp, ["add", "-A"]);
    writeFileSync(path.join(tmp, "msg"), "fixture: shop\n");
    git(work, tmp, ["commit", "-q", "--no-gpg-sign", "--cleanup=verbatim", "-F", path.join(tmp, "msg")], who);
    const sha = git(work, tmp, ["rev-parse", "HEAD"]);
    const mirror = path.join(o.mandatHome, "mirrors", "shop.git");
    let state: "created" | "unchanged" | "recreated" = "created";
    if (existsSync(mirror)) {
      const cur = spawnSync("git", ["--git-dir", mirror, "rev-parse", "HEAD"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: tmp, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).stdout.trim();
      if (cur === sha) return { sha, state: "unchanged" };
      if (!o.force) throw new MandatError("E_FIXTURE_MISMATCH", "mirror-ът е с друг base_commit; пусни с --force", { mirror: cur, built: sha });
      rmSync(mirror, { recursive: true, force: true });
      state = "recreated";
    }
    mkdirSync(path.dirname(mirror), { recursive: true });
    git(tmp, tmp, ["clone", "-q", "--bare", work, mirror]);
    return { sha, state };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

