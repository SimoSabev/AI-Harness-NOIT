import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { filesPatch, lineDiff } from "./patch.js";

describe("filesPatch", () => {
  it("нов файл + пълна замяна + без \\n в края → git apply дава точните байтове", () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "patch-"));
    const git = (...a: string[]) => execFileSync("git", a, { cwd: d, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    git("init", "-q");
    writeFileSync(path.join(d, "CLAUDE.md"), "mine\nno eol");
    const p = filesPatch([
      { path: "AGENTS.md", before: null, after: "# A\nline\n" },
      { path: "CLAUDE.md", before: "mine\nno eol", after: "mine\nno eol\n\nblock\n" },
      { path: "same.md", before: "x\n", after: "x\n" },
    ]);
    expect(p).not.toContain("same.md");
    writeFileSync(path.join(d, "p.diff"), p);
    git("apply", "p.diff");
    expect(readFileSync(path.join(d, "AGENTS.md"), "utf8")).toBe("# A\nline\n");
    expect(readFileSync(path.join(d, "CLAUDE.md"), "utf8")).toBe("mine\nno eol\n\nblock\n");
    expect(() => filesPatch([{ path: "../x", before: null, after: "y" }])).toThrow();
  });
  it("lineDiff", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual(["  a", "- b", "  c", "+ d"]);
  });
});
