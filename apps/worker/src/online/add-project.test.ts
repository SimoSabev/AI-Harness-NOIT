import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLocalProject } from "./add-project.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, seedMinimal } from "./seed.js";

// D-388: "Add project" — a git folder on this computer becomes a project: Mandat's own mirror (its main = the folder's
// current branch), a row in repos, and the rules scan queued. The folder itself is only read.
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
let db: Awaited<ReturnType<typeof pgliteDb>>;
const tmp = mkdtempSync(path.join(os.tmpdir(), "add-project-"));
const home = path.join(tmp, "home");
const repo = (name: string, branch: string, commit = true) => {
  const dir = path.join(tmp, name);
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", branch], { cwd: dir, env });
  if (commit) {
    writeFileSync(path.join(dir, "README.md"), "# hi\n");
    execFileSync("git", ["add", "-A"], { cwd: dir, env });
    execFileSync("git", ["commit", "-q", "-m", "first"], { cwd: dir, env });
  }
  return dir;
};
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  mkdirSync(home, { recursive: true });
});
afterAll(async () => {
  await db.end();
  rmSync(tmp, { recursive: true, force: true });
});

describe("addLocalProject (D-388)", () => {
  it("a folder on master → local/<name>, a bare mirror whose main is that commit, the scan queued; again → the same project", async () => {
    const src = repo("My Shop", "master");
    const r = await addLocalProject({ db, home, org: DEMO_ORG_ID, path: src });
    expect(r).toMatchObject({ ok: true, full_name: "local/my-shop", created: true });
    if (!r.ok) return;
    const row = (await db.query<{ provider: string; remote_url: string; default_branch: string }>("select provider, remote_url, default_branch from public.repos where id = $1", [r.repo_id])).rows[0];
    expect(row).toMatchObject({ provider: "local", default_branch: "main" });
    const mirror = (row?.remote_url ?? "").replace(/^file:\/\//, "");
    expect(mirror.startsWith(path.join(realpathSync(home), "projects"))).toBe(true);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: src, env, encoding: "utf8" }).trim();
    expect(execFileSync("git", ["--git-dir", mirror, "rev-parse", "main"], { env, encoding: "utf8" }).trim()).toBe(head);
    expect((await db.query<{ kind: string; payload: { repo_id: string } }>("select kind, payload from public.outbox where kind = 'harness_scan'")).rows.map((x) => x.payload.repo_id)).toEqual([r.repo_id]);
    expect(await addLocalProject({ db, home, org: DEMO_ORG_ID, path: src })).toEqual({ ...r, created: false });
  });
  it("a second folder with the same name gets its own project", async () => {
    const other = repo(path.join("b", "My Shop"), "main");
    expect(await addLocalProject({ db, home, org: DEMO_ORG_ID, path: other })).toMatchObject({ ok: true, full_name: "local/my-shop-2", created: true });
  });
  it("refusals: no folder, not git, no commit yet, inside Mandat's home", async () => {
    expect(await addLocalProject({ db, home, org: DEMO_ORG_ID, path: path.join(tmp, "nope") })).toEqual({ ok: false, error: "not_a_folder" });
    const plain = path.join(tmp, "plain");
    mkdirSync(plain);
    expect(await addLocalProject({ db, home, org: DEMO_ORG_ID, path: plain })).toEqual({ ok: false, error: "not_git" });
    expect(await addLocalProject({ db, home, org: DEMO_ORG_ID, path: repo("empty", "main", false) })).toEqual({ ok: false, error: "no_commits" });
    expect(await addLocalProject({ db, home, org: DEMO_ORG_ID, path: home })).toEqual({ ok: false, error: "inside_home" });
    expect(existsSync(path.join(home, "projects", "plain.git"))).toBe(false);
  });
});
