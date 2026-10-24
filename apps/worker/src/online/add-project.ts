import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";
import type { AddProjectReply } from "@mandat/contract";
import type { SqlClient } from "@mandat/ledger";
import { enqueueOutbox } from "./pg-outbox.js";

// D-388 (Q-061): "Add project" — a git folder on this computer becomes a project of the local org. Mandat keeps its own
// bare mirror under MANDAT_HOME/projects (the trusted remote every task and the rules scan clone; approved changes and
// rules go into its main, D-367/D-388); the folder itself is only read. The mirror's main is the folder's current commit,
// whatever its branch is called, because the local delivery moves `main`. The rules scan is queued at once.

/** The project's name from its folder: lower case, [a-z0-9._-], at most 60 characters. */
export function projectSlug(folder: string): string {
  const s = path.basename(folder).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "").slice(0, 60);
  return s || "project";
}

const real = (p: string): string | null => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};

export async function addLocalProject(o: { db: SqlClient; home: string; org: string; path: string; tmpRoot?: string }): Promise<AddProjectReply> {
  const dir = real(o.path);
  if (!dir || !statSync(dir).isDirectory()) return { ok: false, error: "not_a_folder" };
  const home = real(o.home) ?? path.resolve(o.home);
  const rel = path.relative(home, dir);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return { ok: false, error: "inside_home" };
  const tmp = mkdtempSync(path.join(o.tmpRoot ?? os.tmpdir(), "mandat-add-"));
  let mirror: string | null = null;
  try {
    const git = cleanGit({ tmpHome: tmp });
    const top = await git.run(["rev-parse", "--show-toplevel"], { cwd: dir });
    if (top.code !== 0) return { ok: false, error: "not_git" };
    const source = real(top.stdout.toString("utf8").trim()) ?? dir;
    const head = await git.run(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], { cwd: source });
    if (head.code !== 0) return { ok: false, error: "no_commits" };
    const sha = head.stdout.toString("utf8").trim();

    // the same folder again → the same project (the mirror remembers where it came from)
    const projects = path.join(home, "projects");
    const rows = (await o.db.query<{ id: string; full_name: string; remote_url: string }>("select id::text as id, full_name, remote_url from public.repos where org_id = $1::uuid and provider = 'local'", [o.org])).rows;
    for (const r of rows) {
      const m = r.remote_url.replace(/^file:\/\//, "");
      if (!m.startsWith(projects + path.sep) || !existsSync(m)) continue;
      const src = await git.run(["config", "--get", "mandat.source"], { cwd: m });
      if (src.code === 0 && src.stdout.toString("utf8").trim() === source) return { ok: true, repo_id: r.id, full_name: r.full_name, created: false };
    }

    const base = projectSlug(source);
    const taken = new Set(rows.map((r) => r.full_name));
    let name = base;
    for (let n = 2; taken.has(`local/${name}`) || existsSync(path.join(projects, `${name}.git`)); n++) name = `${base}-${n}`;
    mkdirSync(projects, { recursive: true });
    mirror = path.join(projects, `${name}.git`);
    const steps: string[][] = [["update-ref", "refs/heads/main", sha], ["symbolic-ref", "HEAD", "refs/heads/main"], ["config", "mandat.source", source]];
    if ((await git.run(["clone", "-q", "--bare", "--no-hardlinks", "--end-of-options", source, mirror], { cwd: tmp })).code !== 0) throw new Error("clone failed");
    for (const a of steps) if ((await git.run(a, { cwd: mirror })).code !== 0) throw new Error(`git ${a[0]} failed`);

    const id = (await o.db.query<{ id: string }>("insert into public.repos (org_id, provider, full_name, remote_url, default_branch) values ($1::uuid, 'local', $2, $3, 'main') returning id::text as id", [o.org, `local/${name}`, `file://${mirror}`])).rows[0]?.id;
    if (!id) throw new Error("no repo row");
    await enqueueOutbox(o.db, { org_id: o.org, kind: "harness_scan", idempotency_key: `scan:${id}:add`, payload: { repo_id: id } });
    return { ok: true, repo_id: id, full_name: `local/${name}`, created: true };
  } catch {
    if (mirror) rmSync(mirror, { recursive: true, force: true });
    return { ok: false, error: "failed" };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
