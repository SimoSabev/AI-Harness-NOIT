import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLEAN_GIT_CONFIG, EMPTY_TREE, cleanGit, cleanGitEnv } from "./index.js";

const tmp = (): string => mkdtempSync(path.join(tmpdir(), "mandat-git-"));

describe("clean git", () => {
  it("чист git: attr.tree — .gitattributes от работното дърво НЕ действа", async () => {
    const home = tmp();
    const repo = tmp();
    const git = cleanGit({ tmpHome: home });
    expect((await git.run(["init", "-q"], { cwd: repo })).code).toBe(0);
    writeFileSync(path.join(repo, "a.txt"), "x\r\ny\r\n");
    writeFileSync(path.join(repo, ".gitattributes"), "* text eol=crlf\n");
    expect((await git.run(["add", "-A"], { cwd: repo })).code).toBe(0);
    const staged = (await git.run(["rev-parse", ":a.txt"], { cwd: repo })).stdout.toString().trim();
    const raw = (await git.run(["hash-object", "--no-filters", "a.txt"], { cwd: repo })).stdout.toString().trim();
    expect(staged).toBe(raw);

    // Control probe: the same clean environment WITHOUT -c attr.tree normalizes CRLF to LF.
    const control = tmp();
    const flags = CLEAN_GIT_CONFIG.filter((f) => !f.startsWith("attr.tree="));
    const run = (args: string[]) =>
      spawnSync("git", [...flags.flatMap((f) => ["-c", f]), ...args], { cwd: control, env: cleanGitEnv(home) });
    run(["init", "-q"]);
    writeFileSync(path.join(control, "a.txt"), "x\r\ny\r\n");
    writeFileSync(path.join(control, ".gitattributes"), "* text eol=crlf\n");
    run(["add", "-A"]);
    const normalized = run(["rev-parse", ":a.txt"]).stdout.toString().trim();
    const lf = run(["hash-object", "--stdin"]);
    expect(normalized).not.toBe(raw);
    expect(normalized).toBe(spawnSync("git", ["hash-object", "--stdin"], { input: "x\ny\n" }).stdout.toString().trim());
    expect(lf.status).toBe(0);
  });

  it("конфигурацията е изцяло изрична", () => {
    expect(CLEAN_GIT_CONFIG).toEqual([
      "core.hooksPath=/dev/null",
      "core.fsmonitor=false",
      `attr.tree=${EMPTY_TREE}`,
      "core.autocrlf=false",
      "protocol.file.allow=always",
    ]);
    const env = cleanGitEnv("/tmp/h");
    expect(env).toMatchObject({
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      HOME: "/tmp/h",
    });
    expect(Object.keys(env).sort()).toEqual(
      ["GIT_ATTR_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT", "HOME", "LANG", "PATH"].sort(),
    );
  });

  it("stdin, stderr и код на грешка", async () => {
    const git = cleanGit({ tmpHome: tmp() });
    const dir = tmp();
    mkdirSync(path.join(dir, "x"));
    const h = await git.run(["hash-object", "--stdin"], { cwd: dir, input: Buffer.from("x\ny\n") });
    expect(h.code).toBe(0);
    expect(h.stdout.toString().trim()).toMatch(/^[0-9a-f]{40}$/);
    const bad = await git.run(["rev-parse", "HEAD"], { cwd: path.join(dir, "x") });
    expect(bad.code).not.toBe(0);
    expect(bad.stderr.length).toBeGreaterThan(0);
  });
});
