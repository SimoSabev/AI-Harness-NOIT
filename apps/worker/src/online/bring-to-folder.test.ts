import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BringReply } from "@mandat/contract";
import { bringToFolder } from "./bring-to-folder.js";
import { cleanGit } from "@mandat/export";
import { snapshotFolder } from "./folder-snapshot.js";

// D-540: "Bring into my folder" with temp git repos (no Docker): the person's folder moves only by a fast-forward, only
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

describe("bringToFolder (D-540)", () => {
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

// D-636 (Simo 26.11.2026): "Bring into my folder" for a project added from a folder without git (D-635). The mirror
// remembers the commit the folder last matched (`mandat.synced`); the bring writes only what the job changed, and only
// when the folder's files are still exactly that commit (nothing the person changed is overwritten). No .git appears.
async function setupPlain() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-bring-plain-")));
  dirs.push(root);
  const home = path.join(root, "home");
  const folder = path.join(root, "notes");
  mkdirSync(path.join(home, "projects"), { recursive: true });
  mkdirSync(path.join(folder, "src"), { recursive: true });
  writeFileSync(path.join(folder, "a.txt"), "one\n");
  writeFileSync(path.join(folder, "old.txt"), "bye\n");
  writeFileSync(path.join(folder, "src", "keep.js"), "k\n");
  mkdirSync(path.join(folder, "node_modules"));
  writeFileSync(path.join(folder, "node_modules", "dep.js"), "dep\n");
  const tmp = mkdtempSync(path.join(root, "t-"));
  const snap = await snapshotFolder(cleanGit({ tmpHome: tmp }), folder, tmp);
  const mirror = path.join(home, "projects", "notes.git");
  git(root, "clone", "-q", "--bare", snap.from, mirror);
  git(mirror, "config", "mandat.source", folder);
  git(mirror, "config", "mandat.synced", snap.sha);
  const w = path.join(root, "w");
  git(root, "clone", "-q", mirror, w);
  writeFileSync(path.join(w, "a.txt"), "one\ntwo\n");
  mkdirSync(path.join(w, "src", "new"), { recursive: true });
  writeFileSync(path.join(w, "src", "new", "b.txt"), "new\n");
  writeFileSync(path.join(w, "run.sh"), "#!/bin/sh\necho hi\n");
  execFileSync("chmod", ["+x", path.join(w, "run.sh")]);
  git(w, "rm", "-q", "old.txt");
  git(w, "add", "-A");
  git(w, "commit", "-q", "-m", "feat: the job");
  git(w, "push", "-q", "origin", "HEAD:main");
  return { root, home, folder, mirror, base: snap.sha, sha: git(mirror, "rev-parse", "main") };
}

describe("bring into a folder without git (D-636)", () => {
  it("writes what the job changed and removes what it deleted; the rest and node_modules stay; no .git appears", async () => {
    const s = await setupPlain();
    const r = await bringToFolder({ home: s.home, mirror: s.mirror, sha: s.sha });
    expect(BringReply.parse(r)).toEqual(r);
    expect(r).toEqual({ ok: true, folder: s.folder, from: s.base, to: s.sha, files: 4 });
    expect(readFileSync(path.join(s.folder, "a.txt"), "utf8")).toBe("one\ntwo\n");
    expect(readFileSync(path.join(s.folder, "src", "new", "b.txt"), "utf8")).toBe("new\n");
    expect(statSync(path.join(s.folder, "run.sh")).mode & 0o111).not.toBe(0);
    expect(existsSync(path.join(s.folder, "old.txt"))).toBe(false);
    expect(readFileSync(path.join(s.folder, "src", "keep.js"), "utf8")).toBe("k\n");
    expect(readFileSync(path.join(s.folder, "node_modules", "dep.js"), "utf8")).toBe("dep\n");
    expect(existsSync(path.join(s.folder, ".git"))).toBe(false);
    expect(git(s.mirror, "config", "--get", "mandat.synced")).toBe(s.sha);
    // again: already there
    expect(await bringToFolder({ home: s.home, mirror: s.mirror, sha: s.sha })).toEqual({ ok: true, folder: s.folder, from: s.sha, to: s.sha, files: 0 });
  });
  it("a file the person changed since → refused, nothing written", async () => {
    const s = await setupPlain();
    writeFileSync(path.join(s.folder, "a.txt"), "mine\n");
    writeFileSync(path.join(s.folder, "extra.txt"), "x\n");
    const r = await bringToFolder({ home: s.home, mirror: s.mirror, sha: s.sha });
    expect(r).toMatchObject({ ok: false, reason: "dirty", folder: s.folder, detail: "2" });
    expect(readFileSync(path.join(s.folder, "a.txt"), "utf8")).toBe("mine\n");
    expect(existsSync(path.join(s.folder, "src", "new", "b.txt"))).toBe(false);
    expect(existsSync(path.join(s.folder, "old.txt"))).toBe(true);
    expect(git(s.mirror, "config", "--get", "mandat.synced")).toBe(s.base);
  });
  it("a path through a symlink that leaves the folder → refused, nothing written outside or inside", async () => {
    const s = await setupPlain();
    const outside = path.join(s.root, "outside");
    mkdirSync(outside);
    rmSync(path.join(s.folder, "node_modules"), { recursive: true, force: true });
    execFileSync("ln", ["-s", outside, path.join(s.folder, "node_modules")]);
    const w = path.join(s.root, "w");
    git(w, "pull", "-q", "origin", "main");
    mkdirSync(path.join(w, "node_modules"), { recursive: true });
    writeFileSync(path.join(w, "node_modules", "evil.js"), "x\n");
    git(w, "add", "-f", "node_modules/evil.js");
    git(w, "commit", "-q", "-m", "sneaky");
    git(w, "push", "-q", "origin", "HEAD:main");
    const sha = git(s.mirror, "rev-parse", "main");
    expect(await bringToFolder({ home: s.home, mirror: s.mirror, sha })).toMatchObject({ ok: false, reason: "refused", folder: s.folder });
    expect(existsSync(path.join(outside, "evil.js"))).toBe(false);
    expect(readFileSync(path.join(s.folder, "a.txt"), "utf8")).toBe("one\n");
  });
  it("a folder without git and without a remembered state is still not a repo", async () => {
    const s = await setupPlain();
    git(s.mirror, "config", "--unset", "mandat.synced");
    expect(await bringToFolder({ home: s.home, mirror: s.mirror, sha: s.sha })).toMatchObject({ ok: false, reason: "not_a_repo" });
  });
});
