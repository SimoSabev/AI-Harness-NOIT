import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { repoFacts } from "./repo-facts.js";

// Round 2: what a project's main has — its files and its package scripts — read from Mandat's mirror, so project
// memories can be checked against it. Only a file:// mirror on this computer; anything else is not checked (null).
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const tmp = mkdtempSync(path.join(os.tmpdir(), "repo-facts-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("repoFacts (round 2)", () => {
  it("lists main's files and the scripts of its package.json", async () => {
    const src = path.join(tmp, "src");
    mkdirSync(path.join(src, "lib"), { recursive: true });
    writeFileSync(path.join(src, "package.json"), JSON.stringify({ name: "x", scripts: { test: "vitest run", lint: "eslint ." } }));
    writeFileSync(path.join(src, "lib", "a.ts"), "export const a = 1;\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: src, env });
    execFileSync("git", ["add", "-A"], { cwd: src, env });
    execFileSync("git", ["commit", "-q", "-m", "x"], { cwd: src, env });
    const mirror = path.join(tmp, "x.git");
    execFileSync("git", ["clone", "-q", "--bare", src, mirror], { env });
    const f = await repoFacts(`file://${mirror}`);
    expect(f && [...f.files].sort()).toEqual(["lib/a.ts", "package.json"]);
    expect(f?.scripts).toEqual({ test: "vitest run", lint: "eslint ." });
  });

  it("a remote that is not a mirror on this computer, or a broken one, is not checked", async () => {
    expect(await repoFacts("https://github.com/o/r.git")).toBeNull();
    expect(await repoFacts(`file://${path.join(tmp, "missing.git")}`)).toBeNull();
  });
});
