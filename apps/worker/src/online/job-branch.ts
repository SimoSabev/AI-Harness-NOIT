import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";

// D-535: the job's branch mandat/job-<id> in Mandat's mirror. It starts at main; every VERIFIED unit moves it forward
// by one commit (fast-forward only, never --force); main is never touched here (mergeLocal does that after approval).
const IDENT = ["-c", "user.name=Mandat", "-c", "user.email=mandat@localhost"];
const REF = /^mandat\/job-[a-z0-9]{1,40}$/;
const SHA = /^[0-9a-f]{40}$/;

async function withTmp<T>(tmpRoot: string | undefined, fn: (tmp: string) => Promise<T>): Promise<T> {
  const tmp = mkdtempSync(path.join(tmpRoot ?? os.tmpdir(), "mandat-job-"));
  try {
    return await fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** the branch head, or null when the branch does not exist */
export async function jobHead(o: { mirror: string; ref: string; tmpRoot?: string }): Promise<string | null> {
  if (!REF.test(o.ref)) throw new Error("jobHead: bad ref");
  return withTmp(o.tmpRoot, async (tmp) => {
    const r = await cleanGit({ tmpHome: tmp }).run(["rev-parse", "--verify", "--quiet", "--end-of-options", `refs/heads/${o.ref}^{commit}`], { cwd: o.mirror });
    const sha = r.stdout.toString("utf8").trim();
    return r.code === 0 && SHA.test(sha) ? sha : null;
  });
}

/** a new branch at main's head (the job's base); an existing branch is kept as it is */
export async function startJobBranch(o: { mirror: string; ref: string; tmpRoot?: string }): Promise<{ base: string; head: string }> {
  if (!REF.test(o.ref)) throw new Error("startJobBranch: bad ref");
  return withTmp(o.tmpRoot, async (tmp) => {
    const git = cleanGit({ tmpHome: tmp });
    const main = (await git.run(["rev-parse", "--verify", "refs/heads/main^{commit}"], { cwd: o.mirror })).stdout.toString("utf8").trim();
    if (!SHA.test(main)) throw new Error("startJobBranch: no main");
    // create only: update-ref with the zero old value fails when the branch already exists
    await git.run(["update-ref", "-m", "mandat: job", `refs/heads/${o.ref}`, main, "0".repeat(40)], { cwd: o.mirror }); // T3-7: sha (ref matches REF, main matches SHA)
    const head = (await git.run(["rev-parse", "--verify", "--end-of-options", `refs/heads/${o.ref}^{commit}`], { cwd: o.mirror })).stdout.toString("utf8").trim();
    return { base: main, head };
  });
}

/** one VERIFIED unit onto the branch: the patch on the head it was verified on (or, threeWay, on the newer head), one commit, fast-forward push */
export async function advanceJobBranch(o: { mirror: string; ref: string; head: string; patch: Buffer; message: string; threeWay?: boolean; tmpRoot?: string }): Promise<{ ok: true; sha: string } | { ok: false; reason: "moved" | "does_not_apply" }> {
  if (!REF.test(o.ref) || !SHA.test(o.head)) throw new Error("advanceJobBranch: bad input");
  return withTmp(o.tmpRoot, async (tmp) => {
    const git = cleanGit({ tmpHome: tmp });
    const now = (await git.run(["rev-parse", "--verify", "--end-of-options", `refs/heads/${o.ref}`], { cwd: o.mirror })).stdout.toString("utf8").trim();
    if (now !== o.head) return { ok: false, reason: "moved" };
    const w = path.join(tmp, "w");
    if ((await git.run(["clone", "-q", "--no-checkout", "--end-of-options", o.mirror, w], { cwd: tmp })).code !== 0) throw new Error("advanceJobBranch: clone failed");
    if ((await git.run(["checkout", "-q", "--detach", o.head], { cwd: w })).code !== 0) throw new Error("advanceJobBranch: no such head");
    writeFileSync(path.join(tmp, "change.patch"), o.patch);
    // D-541: a patch made on an older head goes on with a 3-way merge (the clone has the older blobs); a conflict fails
    const apply = ["apply", "--index", ...(o.threeWay ? ["--3way"] : []), "--whitespace=nowarn", path.join(tmp, "change.patch")];
    if ((await git.run(apply, { cwd: w })).code !== 0) return { ok: false, reason: "does_not_apply" };
    // the very same change is already on the newer head: nothing to commit, the unit is there
    if (o.threeWay && (await git.run(["diff", "--cached", "--quiet"], { cwd: w })).code === 0) return { ok: true, sha: o.head };
    writeFileSync(path.join(tmp, "msg"), o.message.endsWith("\n") ? o.message : `${o.message}\n`);
    if ((await git.run([...IDENT, "commit", "-q", "--no-gpg-sign", "--cleanup=verbatim", "-F", path.join(tmp, "msg")], { cwd: w })).code !== 0) throw new Error("advanceJobBranch: commit failed");
    const sha = (await git.run(["rev-parse", "HEAD"], { cwd: w })).stdout.toString("utf8").trim();
    // no --force: a branch that moved meanwhile is not a fast-forward and the push fails
    if ((await git.run(["push", "-q", "origin", `HEAD:refs/heads/${o.ref}`], { cwd: w })).code !== 0) return { ok: false, reason: "moved" };
    return { ok: true, sha };
  });
}

/**
 * The whole job as files over its base (for the final check, which applies them in place of an agent like a rebase,
 * D-355): every path changed between base and head with its content at head, or null when it was deleted.
 */
export async function jobChangeFiles(o: { mirror: string; base: string; head: string; tmpRoot?: string }): Promise<{ path: string; data: Buffer | null }[]> {
  if (!SHA.test(o.base) || !SHA.test(o.head)) throw new Error("jobChangeFiles: bad input");
  return withTmp(o.tmpRoot, async (tmp) => {
    const git = cleanGit({ tmpHome: tmp });
    const r = await git.run(["diff", "--no-renames", "--name-status", "-z", o.base, o.head], { cwd: o.mirror });
    if (r.code !== 0) throw new Error("jobChangeFiles: diff failed");
    const parts = r.stdout.toString("utf8").split("\0").filter((x) => x !== "");
    const out: { path: string; data: Buffer | null }[] = [];
    for (let k = 0; k + 1 < parts.length; k += 2) {
      const status = parts[k] as string;
      const file = parts[k + 1] as string;
      if (status === "D") out.push({ path: file, data: null });
      else out.push({ path: file, data: (await git.run(["show", `${o.head}:${file}`], { cwd: o.mirror })).stdout }); // T3-7: sha (head matches SHA; the path comes from git's own diff)
    }
    return out;
  });
}

/**
 * D-546: the files of main that match a migration's extended regex (git grep -E, deterministic, with surplus). [] when
 * nothing matches; null when git refuses the regex. At most `max` + 1 paths (the caller refuses more than max).
 */
export async function findSites(o: { mirror: string; match: string; max: number; tmpRoot?: string }): Promise<string[] | null> {
  if (o.match.length === 0 || o.match.length > 200) return null;
  return withTmp(o.tmpRoot, async (tmp) => {
    const r = await cleanGit({ tmpHome: tmp }).run(["grep", "-l", "-I", "-E", "-e", o.match, "refs/heads/main", "--"], { cwd: o.mirror });
    if (r.code === 1) return [];
    if (r.code !== 0) return null;
    const prefix = "refs/heads/main:";
    return [...new Set(r.stdout.toString("utf8").split("\n").map((l) => l.trim()).filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length)))].sort().slice(0, o.max + 1);
  });
}

/**
 * D-547: the job's whole change over its old base, built again on main's head with a 3-way merge (one commit). The
 * branch moves only from the head it had (update-ref with the old value): a branch that moved meanwhile is left alone.
 * Nothing to commit (main has all of it already) leaves the head at main.
 */
export async function restackJobBranch(o: { mirror: string; ref: string; base: string; head: string; message: string; tmpRoot?: string }): Promise<{ ok: true; base: string; head: string } | { ok: false; reason: "moved" | "does_not_apply" }> {
  if (!REF.test(o.ref) || !SHA.test(o.base) || !SHA.test(o.head)) throw new Error("restackJobBranch: bad input");
  return withTmp(o.tmpRoot, async (tmp) => {
    const git = cleanGit({ tmpHome: tmp });
    const now = (await git.run(["rev-parse", "--verify", "--end-of-options", `refs/heads/${o.ref}`], { cwd: o.mirror })).stdout.toString("utf8").trim();
    if (now !== o.head) return { ok: false, reason: "moved" };
    const main = (await git.run(["rev-parse", "--verify", "refs/heads/main^{commit}"], { cwd: o.mirror })).stdout.toString("utf8").trim();
    if (!SHA.test(main)) throw new Error("restackJobBranch: no main");
    const diff = await git.run(["diff", "--binary", "--full-index", o.base, o.head], { cwd: o.mirror });
    if (diff.code !== 0) throw new Error("restackJobBranch: diff failed");
    const w = path.join(tmp, "w");
    if ((await git.run(["clone", "-q", "--no-checkout", "--end-of-options", o.mirror, w], { cwd: tmp })).code !== 0) throw new Error("restackJobBranch: clone failed");
    if ((await git.run(["checkout", "-q", "--detach", main], { cwd: w })).code !== 0) throw new Error("restackJobBranch: no main");
    let sha = main;
    if (diff.stdout.length > 0) {
      writeFileSync(path.join(tmp, "change.patch"), diff.stdout);
      if ((await git.run(["apply", "--index", "--3way", "--whitespace=nowarn", path.join(tmp, "change.patch")], { cwd: w })).code !== 0) return { ok: false, reason: "does_not_apply" };
      // a 3-way merge with conflicts still exits 0 for some git versions; unmerged paths mean it did not apply
      const unmerged = (await git.run(["diff", "--name-only", "--diff-filter=U"], { cwd: w })).stdout.toString("utf8").trim();
      if (unmerged !== "") return { ok: false, reason: "does_not_apply" };
      if ((await git.run(["diff", "--cached", "--quiet"], { cwd: w })).code !== 0) {
        writeFileSync(path.join(tmp, "msg"), o.message.endsWith("\n") ? o.message : `${o.message}\n`);
        if ((await git.run([...IDENT, "commit", "-q", "--no-gpg-sign", "--cleanup=verbatim", "-F", path.join(tmp, "msg")], { cwd: w })).code !== 0) throw new Error("restackJobBranch: commit failed");
        sha = (await git.run(["rev-parse", "HEAD"], { cwd: w })).stdout.toString("utf8").trim();
        // the commit goes into the mirror under a scratch ref, then the branch moves from its old head only
        const tmpRef = `refs/mandat/restack/${o.ref.slice("mandat/".length)}`;
        if ((await git.run(["push", "-q", "--force", "origin", `HEAD:${tmpRef}`], { cwd: w })).code !== 0) throw new Error("restackJobBranch: push failed");
        const moved = await git.run(["update-ref", "-m", "mandat: job on the new main", `refs/heads/${o.ref}`, sha, o.head], { cwd: o.mirror }); // T3-7: sha (ref matches REF; sha and head match SHA)
        await git.run(["update-ref", "-d", tmpRef], { cwd: o.mirror });
        return moved.code === 0 ? { ok: true, base: main, head: sha } : { ok: false, reason: "moved" };
      }
    }
    const moved = await git.run(["update-ref", "-m", "mandat: job on the new main", `refs/heads/${o.ref}`, sha, o.head], { cwd: o.mirror }); // T3-7: sha (ref matches REF; sha and head match SHA)
    return moved.code === 0 ? { ok: true, base: main, head: sha } : { ok: false, reason: "moved" };
  });
}
