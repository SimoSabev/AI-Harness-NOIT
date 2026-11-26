import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { CleanGit } from "@mandat/export";
import type { BringReply } from "@mandat/contract";
import { snapshotFolder } from "./folder-snapshot.js";

// D-636: "Bring into my folder" for a project added from a folder without git history (D-635). The mirror remembers the
// commit the folder was last left in (`mandat.synced`). The bring is allowed only when the folder's files are still
// exactly that commit (a snapshot made the same way as at "Add project"); then it writes only what the job changed —
// the new and changed files, the deleted ones removed — and remembers the new state. Nothing else in the folder is
// touched, no .git is made, and a path that could leave the folder (.., absolute, .git, through a symlink) stops it.

interface Change { status: string; mode: string; sha: string; rel: string }
const no = (reason: Extract<BringReply, { ok: false }>["reason"], folder: string, detail: string | null = null): BringReply => ({ ok: false, reason, folder, detail, command: null });

/** `git diff-tree -r -z --raw`: ":<old mode> <new mode> <old sha> <new sha> <status>\0<path>\0" */
function parseRaw(out: Buffer): Change[] {
  const parts = out.toString("utf8").split("\0");
  const list: Change[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const head = (parts[i] ?? "").replace(/^:/, "").split(" ");
    const rel = parts[i + 1] ?? "";
    if (head.length < 5 || rel === "") continue;
    list.push({ mode: head[1] ?? "", sha: head[3] ?? "", status: (head[4] ?? "").charAt(0), rel });
  }
  return list;
}

/** the place of a repo path inside the folder, or null when it could leave it */
function target(folder: string, rel: string, gone: ReadonlySet<string>): string | null {
  if (rel.includes("\0") || rel.includes("\\") || path.isAbsolute(rel)) return null;
  const segs = rel.split("/");
  if (segs.some((s) => s === "" || s === "." || s === ".." || s.toLowerCase() === ".git")) return null;
  let cur = folder;
  for (const s of segs.slice(0, -1)) {
    cur = path.join(cur, s);
    if (gone.has(cur) || !existsSync(cur)) continue;
    const st = lstatSync(cur);
    if (st.isSymbolicLink() || !st.isDirectory()) return null;
  }
  const full = path.join(folder, ...segs);
  if (!gone.has(full) && existsSync(full) && lstatSync(full).isDirectory()) return null;
  return full;
}

export async function bringPlain(o: { git: CleanGit; mirror: string; folder: string; tmp: string; synced: string; main: string }): Promise<BringReply> {
  const { git, mirror, folder } = o;
  // the folder now, compared with the state it was left in (the mirror's objects seen from the snapshot's repo)
  const snap = await snapshotFolder(git, folder, o.tmp);
  writeFileSync(path.join(snap.gitDir, "objects", "info", "alternates"), `${path.join(mirror, "objects")}\n`);
  const now = await git.run(["--git-dir", snap.gitDir, "diff-tree", "-r", "-z", "--name-only", "--no-renames", o.synced, snap.sha], { cwd: o.tmp });
  if (now.code !== 0) return no("refused", folder, "compare");
  const touched = now.stdout.toString("utf8").split("\0").filter(Boolean).length;
  if (touched > 0) return no("dirty", folder, `${touched}`);
  if (o.synced === o.main) return { ok: true, folder, from: o.synced, to: o.main, files: 0 };

  const diff = await git.run(["diff-tree", "-r", "-z", "--raw", "--no-renames", o.synced, o.main], { cwd: mirror });
  if (diff.code !== 0) return no("refused", folder, "diff");
  const changes = parseRaw(diff.stdout).filter((c) => c.mode !== "160000");
  // every place is checked before anything is written
  const deletes = changes.filter((c) => c.status === "D");
  const gone = new Set<string>();
  for (const c of deletes) {
    const full = target(folder, c.rel, gone);
    if (!full) return no("refused", folder, `unsafe path: ${c.rel.slice(0, 200)}`);
    gone.add(full);
  }
  const writes: { full: string; c: Change }[] = [];
  for (const c of changes.filter((x) => x.status !== "D")) {
    const full = target(folder, c.rel, gone);
    if (!full || !/^(100644|100755|120000)$/.test(c.mode)) return no("refused", folder, `unsafe path: ${c.rel.slice(0, 200)}`);
    writes.push({ full, c });
  }
  const blobs = new Map<string, Buffer>();
  for (const w of writes) {
    const b = await git.run(["cat-file", "blob", w.c.sha], { cwd: mirror });
    if (b.code !== 0) return no("refused", folder, "blob");
    blobs.set(w.full, b.stdout);
  }
  for (const full of gone) if (existsSync(full) || lstatSync(full, { throwIfNoEntry: false })) unlinkSync(full);
  for (const { full, c } of writes) {
    mkdirSync(path.dirname(full), { recursive: true });
    const data = blobs.get(full) ?? Buffer.alloc(0);
    if (lstatSync(full, { throwIfNoEntry: false })) rmSync(full, { force: true });
    if (c.mode === "120000") {
      symlinkSync(data.toString("utf8"), full);
      continue;
    }
    const tmp = path.join(path.dirname(full), `.${path.basename(full)}.harnova-${randomBytes(4).toString("hex")}`);
    writeFileSync(tmp, data);
    chmodSync(tmp, c.mode === "100755" ? 0o755 : 0o644);
    renameSync(tmp, full);
  }
  if ((await git.run(["config", "mandat.synced", o.main], { cwd: mirror })).code !== 0) return no("refused", folder, "remember");
  return { ok: true, folder, from: o.synced, to: o.main, files: changes.length };
}
