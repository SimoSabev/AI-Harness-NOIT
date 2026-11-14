import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { crlfCheckouts, parseEol, stageWithLf, workingTreeFiles } from "./worktree.js";

// D-518: Git for Windows checks text files out with CRLF (core.autocrlf=true in its system config), while Mandat's own git
// ignores that config. The raw bytes then differ from the LF blobs at base in every file, so an untouched .github/ci.yml
// looked changed (UNKNOWN D3:protected_path). A tracked file stored with LF and checked out with CRLF is taken with LF,
// as `git add` would store it; everything else stays byte for byte.
describe("line endings of a Windows checkout (D-518)", () => {
  it("parseEol: only tracked LF files whose checkout is CRLF, and never ones marked binary or -text", () => {
    const out = [
      "i/lf    w/crlf  attr/                 \tsrc/a.ts",
      "i/      w/crlf  attr/                 \tnew.txt",
      "i/lf    w/lf    attr/                 \tsrc/b.ts",
      "i/lf    w/mixed attr/                 \tsrc/m.ts",
      "i/crlf  w/crlf  attr/                 \twin.bat",
      "i/lf    w/crlf  attr/-text            \traw.txt",
      "i/lf    w/crlf  attr/text eol=crlf    \teol.txt",
      "i/lf    w/crlf  attr/binary           \tbin.dat",
      "",
    ].join("\0");
    expect([...parseEol(out)]).toEqual(["src/a.ts"]);
  });

  it("an untouched CRLF checkout becomes the base bytes; a real edit keeps the edit, with LF", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-eol-"));
    const repo = path.join(tmp, "r");
    const git = (...a: string[]) => execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "user.name=t", "-c", "user.email=t@t.invalid", "-c", "core.autocrlf=false", ...a], { cwd: repo });
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(path.join(repo, "ci.yml"), "on: push\njobs: {}\n");
    writeFileSync(path.join(repo, "cart.ts"), "a\nb\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    writeFileSync(path.join(repo, "ci.yml"), "on: push\r\njobs: {}\r\n");
    writeFileSync(path.join(repo, "cart.ts"), "a\r\nB\r\n");
    writeFileSync(path.join(repo, "new.txt"), "n\r\n");
    const home = path.join(tmp, "h");
    const files = await workingTreeFiles({ repo, tmpHome: home });
    const lf = await crlfCheckouts({ repo, tmpHome: home });
    expect([...lf].sort()).toEqual(["cart.ts", "ci.yml"]);
    const stage = stageWithLf(repo, files, lf, path.join(tmp, "stage"));
    expect(readFileSync(path.join(stage, "ci.yml"), "utf8")).toBe("on: push\njobs: {}\n");
    expect(readFileSync(path.join(stage, "cart.ts"), "utf8")).toBe("a\nB\n");
    expect(readFileSync(path.join(stage, "new.txt"), "utf8")).toBe("n\r\n");
  });
});
