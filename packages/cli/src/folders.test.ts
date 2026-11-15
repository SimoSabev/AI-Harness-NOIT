import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FolderListing, FoundProjects } from "@mandat/contract";
import { findProjects, listFolder } from "./commands/folders.js";

// D-388 (folder picker): `mandat local` lists sub-folders (names and paths only) and finds git projects in usual places.
let root: string;
let home: string;
let appHome: string;
const mk = (...p: string[]) => mkdirSync(path.join(...p), { recursive: true });
const git = (...p: string[]) => mk(...p, ".git");

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-folders-")));
  home = path.join(root, "home");
  appHome = path.join(home, "app-data");
  git(home, "code", "shop");
  git(home, "code", "zeta");
  mk(home, "code", "notes");
  git(home, "code", "notes", "inner");
  git(home, "code", "deep", "a", "b");
  mk(home, "code", "node_modules", "x");
  mk(home, "code", ".hidden");
  mk(home, "AppData");
  git(home, "Desktop", "alpha");
  git(home, "Documents", "beta", "nested");
  git(appHome, "mirror");
  writeFileSync(path.join(home, "code", "readme.txt"), "not a folder");
  mk(home, "code", "wt");
  writeFileSync(path.join(home, "code", "wt", ".git"), "gitdir: ../shop/.git/worktrees/wt\n");
  try {
    symlinkSync(path.join(home, "code"), path.join(home, "link"), "junction");
  } catch {
    // no symlinks here: the skip is still tested by the absence of other links
  }
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const env = () => ({ home, refuse: [appHome], roots: async () => [path.parse(root).root] });

describe("listFolder (D-388, folder picker)", () => {
  it("sub-folders only: git first then by name; hidden, heavy and system folders skipped; files skipped", async () => {
    const l = await listFolder(env(), path.join(home, "code"));
    expect(FolderListing.safeParse(l).success).toBe(true);
    expect(l?.entries.map((e) => [e.name, e.git])).toEqual([["shop", true], ["wt", true], ["zeta", true], ["deep", false], ["notes", false]]);
    expect(l?.entries[0]?.path).toBe(path.join(home, "code", "shop"));
    expect(l?.parent).toBe(home);
    expect(l?.path).toBe(path.join(home, "code"));
    expect(l?.truncated).toBe(false);
    expect(l?.roots).toEqual([path.parse(root).root]);
  });
  it("no path → the home folder; the app's own folder, AppData and links are not offered", async () => {
    const l = await listFolder(env(), undefined);
    expect(l?.path).toBe(home);
    expect(l?.entries.map((e) => e.name)).toEqual(["code", "Desktop", "Documents"]);
  });
  it("a root has no parent; a file or a missing folder → null", async () => {
    const r = path.parse(root).root;
    expect((await listFolder(env(), r))?.parent).toBeNull();
    expect(await listFolder(env(), path.join(home, "code", "readme.txt"))).toBeNull();
    expect(await listFolder(env(), path.join(home, "missing"))).toBeNull();
  });
  it("caps the entries and says so", async () => {
    const many = path.join(root, "many");
    for (let i = 0; i < 305; i++) mk(many, `d${String(i).padStart(3, "0")}`);
    const l = await listFolder(env(), many);
    expect([l?.entries.length, l?.truncated]).toEqual([300, true]);
    expect(FolderListing.safeParse(l).success).toBe(true);
  });
});

describe("findProjects (D-388, folder picker)", () => {
  it("git projects in the home folder and the usual places, to depth 2; not inside a project; not the app's folder", async () => {
    const f = await findProjects(env());
    expect(FoundProjects.safeParse(f).success).toBe(true);
    const names = f.found.map((p) => p.name);
    expect(names).toEqual(["alpha", "inner", "nested", "shop", "wt", "zeta"]);
    expect(names).not.toContain("b");
    expect(names).not.toContain("mirror");
    expect(new Set(f.found.map((p) => p.path)).size).toBe(f.found.length);
    expect(f.found.find((p) => p.name === "alpha")?.path).toBe(path.join(home, "Desktop", "alpha"));
  });
  it("stops at the time budget", async () => {
    let t = 0;
    const f = await findProjects({ ...env(), now: () => (t += 1000) }, 1500);
    expect(f.found.length).toBeLessThan(6);
  });
});
