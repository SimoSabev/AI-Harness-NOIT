import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cleanGit } from "@mandat/export";
import type { CleanGit } from "@mandat/export";

// Демо промпт т. 5.7 (2) / S1 / D-232: the base comes from a remote the human named, fetched into Mandat's own mirror.
// Nothing from the agent's .git (refs/remotes/*, origin HEAD, remote.origin.url) is trusted, and nothing is written there.

export const REF_NAME = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;
/** T3-7: every git call of Mandat that writes refs. */
const FSYNC = ["-c", "core.fsync=objects,reference"];

export type BaseUntrusted = "no_remote" | "not_a_repo" | "fetch_failed" | "on_default_branch" | "no_merge_base" | "bad_ref";
export type TrustedBase =
  | { ok: true; mirror: string; branch: string; baseSha: string; trustedTip: string; agentHead: string }
  | { ok: false; reason: BaseUntrusted; detail: string };

export function mirrorPathFor(home: string, remote: string): string {
  return path.join(home, "mirrors", `${createHash("sha256").update(remote).digest("hex").slice(0, 16)}.git`);
}

async function out(git: CleanGit, args: string[], cwd: string): Promise<{ ok: boolean; text: string; err: string }> {
  const r = await git.run(args, { cwd });
  return { ok: r.code === 0, text: r.stdout.toString("utf8").trim(), err: r.stderr.slice(0, 300) };
}

export async function resolveTrustedBase(o: { repo: string; remote: string | null; home: string; tmpHome: string }): Promise<TrustedBase> {
  if (!o.remote) return { ok: false, reason: "no_remote", detail: "--remote is required" };
  if (o.remote.startsWith("-")) return { ok: false, reason: "bad_ref", detail: "remote starts with -" };
  const git = cleanGit({ tmpHome: o.tmpHome });
  const repo = path.resolve(o.repo);
  const top = await out(git, ["rev-parse", "--show-toplevel"], repo);
  if (!top.ok) return { ok: false, reason: "not_a_repo", detail: top.err };
  const mirror = mirrorPathFor(o.home, o.remote);
  if (!existsSync(path.join(mirror, "HEAD"))) {
    mkdirSync(mirror, { recursive: true });
    const init = await out(git, ["init", "-q", "--bare", mirror], o.tmpHome);
    /* v8 ignore next */
    if (!init.ok) return { ok: false, reason: "fetch_failed", detail: init.err };
  }
  const ls = await out(git, ["ls-remote", "--symref", "--end-of-options", o.remote, "HEAD"], mirror);
  if (!ls.ok) return { ok: false, reason: "fetch_failed", detail: ls.err };
  const m = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(ls.text);
  const branch = m?.[1];
  if (!branch) return { ok: false, reason: "fetch_failed", detail: "remote has no symbolic HEAD" };
  if (!REF_NAME.test(branch)) return { ok: false, reason: "bad_ref", detail: "default branch name" };
  const trustedRef = `refs/mandat/trusted/${branch}`;
  const f1 = await out(git, [...FSYNC, "fetch", "-q", "--no-tags", "--end-of-options", o.remote, `+refs/heads/${branch}:${trustedRef}`], mirror);
  if (!f1.ok) return { ok: false, reason: "fetch_failed", detail: f1.err };
  const sym = await out(git, ["symbolic-ref", "-q", "HEAD"], repo);
  if (sym.ok && sym.text === `refs/heads/${branch}`) return { ok: false, reason: "on_default_branch", detail: branch };
  const f2 = await out(git, [...FSYNC, "fetch", "-q", "--no-tags", "--end-of-options", top.text, "+HEAD:refs/mandat/agent/head"], mirror);
  if (!f2.ok) return { ok: false, reason: "fetch_failed", detail: f2.err };
  const tip = await out(git, ["rev-parse", "--verify", "--end-of-options", `${trustedRef}^{commit}`], mirror);
  const head = await out(git, ["rev-parse", "--verify", "--end-of-options", "refs/mandat/agent/head^{commit}"], mirror);
  const mb = await out(git, ["merge-base", "--end-of-options", trustedRef, "refs/mandat/agent/head"], mirror);
  if (!mb.ok || !/^[0-9a-f]{40}$/.test(mb.text)) return { ok: false, reason: "no_merge_base", detail: mb.err };
  // cleanClone (E0) clones refs/heads/*: the pinned base gets a branch in Mandat's own mirror; HEAD points to it.
  const up = await out(git, [...FSYNC, "update-ref", "refs/heads/mandat/base", mb.text], mirror);
  const hd = await out(git, ["symbolic-ref", "HEAD", "refs/heads/mandat/base"], mirror);
  /* v8 ignore next */
  if (!up.ok || !hd.ok) return { ok: false, reason: "fetch_failed", detail: up.err || hd.err };
  return { ok: true, mirror, branch, baseSha: mb.text, trustedTip: tip.text, agentHead: head.text };
}

/** К-1: a file at the trusted base, read from the mirror; null when it does not exist. */
export async function readAtBase(o: { mirror: string; baseSha: string; file: string; tmpHome: string }): Promise<Buffer | null> {
  if (!/^[0-9a-f]{40}$/.test(o.baseSha)) return null;
  const r = await cleanGit({ tmpHome: o.tmpHome }).run(["cat-file", "blob", `${o.baseSha}:${o.file}`], { cwd: o.mirror }); // T3-7: sha (checked above)
  return r.code === 0 ? r.stdout : null;
}
