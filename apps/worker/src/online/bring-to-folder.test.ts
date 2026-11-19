import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BringReply } from "@mandat/contract";
import { bringToFolder } from "./bring-to-folder.js";

// D-538: "Bring into my folder" with temp git repos (no Docker): the person's folder moves only by a fast-forward, only
// when it is the project's source folder, on the delivered branch, clean, and not diverged. Otherwise nothing changes.
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" }).trim();

function setup() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-bring-")));
  dirs.push(root);
  const home = path.join(root, "home");
  const folder = path.join(root, "luxproof");
  mkdirSync(path.join(home, "projects"), { recursive: true });
  mkdirSync(folder);
  git(folder, "init", "-q", "-b", "main");
  writeFileSync(path.join(folder, ".gitignore"), "dist/\n");
  writeFileSync(path.join(folder, "a.txt"), "one\n");
  git(folder, "add", ".");
  git(folder, "commit", "-q", "-m", "base");
  const base = git(folder, "rev-parse", "HEAD");
  const mirror = path.join(home, "projects", "luxproof.git");
  git(root, "clone", "-q", "--bare", folder, mirror);
  git(mirror, "config", "mandat.source", folder);
  // the job merged into the mirror's main: one commit on top of the base
  const w = path.join(root, "w");
  git(root, "clone", "-q", mirror, w);
  writeFileSync(path.join(w, "a.txt"), "one\ntwo\n");
  writeFileSync(path.join(w, "b.txt"), "new\n");
  git(w, "add", ".");
  git(w, "commit", "-q", "-m", "feat: the job");
  git(w, "push", "-q", "origin", "HEAD:main");
  const sha = git(mirror, "rev-parse", "main");
  return { root, home, folder, mirror, base, sha };
}
const bring = async (s: ReturnType<typeof setup>, o: { sha?: string; branch?: string; mirror?: string } = {}) => {
  const r = await bringToFolder({ home: s.home, mirror: o.mirror ?? s.mirror, sha: o.sha ?? s.sha, ...(o.branch ? { branch: o.branch } : {}) });
  expect(BringReply.parse(r)).toEqual(r);
  return r;
};

describe("bringToFolder (D-538)", () => {
  it("a clean folder on main fast-forwards to the delivered commit; an ignored file stays as it was", async () => {
    const s = setup();
    mkdirSync(path.join(s.folder, "dist"));
    writeFileSync(path.join(s.folder, "dist", "out.js"), "built\n");
    const r = await bring(s);
    expect(r).toEqual({ ok: true, folder: s.folder, from: s.base, to: s.sha, files: 2 });
    expect(git(s.folder, "rev-parse", "HEAD")).toBe(s.sha);
    expect(readFileSync(path.join(s.folder, "b.txt"), "utf8")).toBe("new\n");
    expect(readFileSync(path.join(s.folder, "dist", "out.js"), "utf8")).toBe("built\n");
    expect(git(s.folder, "status", "--porcelain")).toBe("");
  });
  it("already there → done with nothing to move", async () => {
    const s = setup();
    await bring(s);
    expect(await bring(s)).toEqual({ ok: true, folder: s.folder, from: s.sha, to: s.sha, files: 0 });
  });
  it("a changed file or an untracked file that is not ignored → refused, the folder untouched", async () => {
    for (const change of ["modified", "untracked", "staged"] as const) {
      const s = setup();
      if (change === "modified") writeFileSync(path.join(s.folder, "a.txt"), "mine\n");
      if (change === "untracked") writeFileSync(path.join(s.folder, "notes.md"), "mine\n");
      if (change === "staged") {
        writeFileSync(path.join(s.folder, "c.txt"), "mine\n");
        git(s.folder, "add", "c.txt");
      }
      const r = await bring(s);
      expect(r).toMatchObject({ ok: false, reason: "dirty", folder: s.folder });
      if (!r.ok) expect(r.command).toContain("pull --ff-only");
      expect(git(s.folder, "rev-parse", "HEAD")).toBe(s.base);
      expect(git(s.folder, "status", "--porcelain")).not.toBe("");
    }
  });
  it("another branch checked out → refused with the branch it is on", async () => {
    const s = setup();
    git(s.folder, "switch", "-q", "-c", "work");
    const r = await bring(s);
    expect(r).toMatchObject({ ok: false, reason: "other_branch", detail: "work" });
    if (!r.ok) expect(r.command).toContain("switch main");
    expect(git(s.folder, "rev-parse", "HEAD")).toBe(s.base);
    expect(git(s.folder, "branch", "--show-current")).toBe("work");
  });
  it("the person's own commit on main → diverged, nothing merged, the command to merge by hand", async () => {
    const s = setup();
    writeFileSync(path.join(s.folder, "mine.txt"), "x\n");
    git(s.folder, "add", ".");
    git(s.folder, "commit", "-q", "-m", "mine");
    const head = git(s.folder, "rev-parse", "HEAD");
    const r = await bring(s);
    expect(r).toMatchObject({ ok: false, reason: "diverged" });
    if (!r.ok) expect(r.command).toContain("pull");
    expect(git(s.folder, "rev-parse", "HEAD")).toBe(head);
    expect(git(s.folder, "status", "--porcelain")).toBe("");
  });
  it("a commit the mirror's main does not have, a mirror outside the projects or without a source → refused", async () => {
    const s = setup();
    expect(await bring(s, { sha: "f".repeat(40) })).toMatchObject({ ok: false, reason: "not_delivered" });
    const other = path.join(s.root, "elsewhere.git");
    git(s.root, "clone", "-q", "--bare", s.mirror, other);
    expect(await bring(s, { mirror: other })).toMatchObject({ ok: false, reason: "no_source", folder: null });
    git(s.mirror, "config", "--unset", "mandat.source");
    expect(await bring(s)).toMatchObject({ ok: false, reason: "no_source" });
    expect(git(s.folder, "rev-parse", "HEAD")).toBe(s.base);
  });
  it("a source that is no longer a git folder → not_a_repo", async () => {
    const s = setup();
    rmSync(path.join(s.folder, ".git"), { recursive: true, force: true });
    expect(await bring(s)).toMatchObject({ ok: false, reason: "not_a_repo" });
  });
});
