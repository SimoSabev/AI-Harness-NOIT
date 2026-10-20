import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import fc from "fast-check";
import * as tar from "tar";
import { describe, expect, it } from "vitest";
import { exportChangeset, recomputeTreeSha, scanTar, unreadablePath, cleanClone, removeTree, parseNameStatus } from "./index.js";

const tmp = (p = "mandat-exp-") => mkdtempSync(path.join(tmpdir(), p));
const RUN = "r_01JB8Z3K4M5N6P7Q8R9S0T1V2W";
const limits = { max_file_mb: 5, max_diff_mb: 50, max_files: 500 };
const scanLimits = { maxFileBytes: 5 * 1024 * 1024, maxBinaryBytes: 1048576 as const, maxTarBytes: 524288000 as const };

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: cwd, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
function writeTree(dir: string, files: Record<string, string | Buffer>): void {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    writeFileSync(path.join(dir, p), c);
  }
}
/** A mirror whose single commit contains `files`. */
function mirror(files: Record<string, string | Buffer>): { mirrorPath: string; baseSha: string } {
  const w = tmp("mandat-src-");
  git(w, "init", "-q");
  writeTree(w, files);
  git(w, "add", "-A");
  git(w, "commit", "-q", "-m", "base");
  const m = path.join(tmp("mandat-mirror-"), "m.git");
  git(path.dirname(m), "clone", "-q", "--bare", w, m);
  return { mirrorPath: m, baseSha: git(w, "rev-parse", "HEAD") };
}
const tarOf = (dir: string, entries = readdirSync(dir)): NodeJS.ReadableStream => tar.c({ cwd: dir, portable: true }, entries) as unknown as NodeJS.ReadableStream;
const ok = Promise.resolve({ code: 0, stderr: "" });

type RawEntry = { path: string; type: string; body?: Buffer; linkpath?: string; size?: number };
function rawTar(entries: RawEntry[], patch?: (h: Buffer, i: number) => void): Buffer {
  const parts: Buffer[] = [];
  entries.forEach((e, i) => {
    const body = e.body ?? Buffer.alloc(0);
    const h = Buffer.alloc(512);
    new tar.Header({ path: e.path, type: e.type as "File", size: e.size ?? body.length, mode: 0o644, mtime: new Date(0), ...(e.linkpath ? { linkpath: e.linkpath } : {}) }).encode(h, 0);
    if (patch) {
      patch(h, i);
      h.fill(0x20, 148, 156);
      let sum = 0;
      for (const b of h) sum += b;
      h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "latin1");
    }
    parts.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  });
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
const codes = async (entries: RawEntry[], patch?: (h: Buffer, i: number) => void) => {
  const r = await scanTar(Readable.from([rawTar(entries, patch)]), scanLimits);
  return r.ok ? [] : r.reasons.map((x) => `${x.code}:${x.path}`);
};

describe("tar-scan", () => {
  it("всички причини се събират", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 0x61);
    const bin = Buffer.concat([Buffer.from([0]), Buffer.alloc(2 * 1024 * 1024, 1)]);
    const r = await codes([
      { path: "src/l", type: "SymbolicLink", linkpath: "/etc/passwd" },
      { path: "src/h", type: "Link", linkpath: "src/a.ts" },
      { path: "dev", type: "CharacterDevice" },
      { path: "blk", type: "BlockDevice" },
      { path: "pipe", type: "FIFO" },
      { path: "src/.git/HEAD", type: "File", body: Buffer.from("x") },
      { path: "src/.GIT", type: "File", body: Buffer.from("x") },
      { path: ".gitmodules", type: "File", body: Buffer.from("x") },
      { path: "../evil", type: "File", body: Buffer.from("x") },
      { path: "bin.dat", type: "File", body: bin },
      { path: "big.txt", type: "File", body: big },
      { path: "src/ok.ts", type: "File", body: Buffer.from("ok") },
    ]);
    expect(r).toEqual([
      "symlink:src/l", "hardlink:src/h", "device:dev", "device:blk", "fifo:pipe", "git_path:src/.git/HEAD", "git_path:src/.GIT",
      "gitmodules:.gitmodules", "path_traversal:../evil", "binary_too_large:bin.dat", "file_too_large:big.txt",
    ]);
  });

  it("типове и UTF-8 (D-127)", async () => {
    expect(await codes([{ path: "d", type: "GNUDumpDir" }])).toEqual(["device:d"]);
    const okr = await scanTar(Readable.from([rawTar([{ path: "./src/a.ts", type: "ContiguousFile", body: Buffer.from("a") }, { path: "b.ts", type: "OldFile", body: Buffer.from("b") }])]), scanLimits);
    expect(okr).toEqual({ ok: true, entries: [{ path: "src/a.ts", type: "File", mode: 0o644, bytes: 1 }, { path: "b.ts", type: "File", mode: 0o644, bytes: 1 }] });
    // unknown type flag → ignoredEntry → device
    expect(await codes([{ path: "weird", type: "File", body: Buffer.from("x") }], (h) => (h[156] = "Z".charCodeAt(0)))).toEqual(["device:weird"]);
    // byte 0xFF in the path → U+FFFD → non_utf8_path
    const bad = await codes([{ path: "src/X.ts", type: "File", body: Buffer.from("x") }], (h) => (h[4] = 0xff));
    expect(bad).toEqual(["non_utf8_path:src/�.ts"]);
  });

  it("unreadablePath (D-061)", () => {
    expect(unreadablePath("tar: ./src/x.ts: Cannot open: Permission denied\n")).toBe("src/x.ts");
    expect(unreadablePath("tar: something bad")).toBe("-");
  });

  it("parseNameStatus", () => {
    expect(parseNameStatus(Buffer.from("M\0a.ts\0R087\0old.ts\0new.ts\0D\0x\0A\0y\0C090\0p\0q\0T\0t\0"))).toEqual([
      { status: "M", path: "a.ts" }, { status: "R", path: "new.ts", old_path: "old.ts" }, { status: "D", path: "x" }, { status: "A", path: "y" }, { status: "A", path: "q" }, { status: "M", path: "t" },
    ]);
  });
});

const BASE = { "src/cart.ts": "const DISCOUNT_THRESHOLD_CENTS = 50000;\n", "src/money.ts": "export const x = 1;\n", ".gitignore": "node_modules/\n", "README.md": "# shop\n" };

describe("exportChangeset", () => {
  it("честна промяна: tree_sha = ръчен комит; recompute = tree_sha; временният tar е изтрит", async () => {
    const m = mirror(BASE);
    const head = tmp();
    writeTree(head, { ...BASE, "src/cart.ts": "const DISCOUNT_THRESHOLD_CENTS = 5000;\n" });
    const tmpRoot = tmp();
    const runDir = tmp();
    const r = await exportChangeset({ runId: RUN, ...m, tar: tarOf(head), tarExit: ok, limits, tmpRoot });
    if (!r.result.ok || !("diffPatch" in r)) throw new Error("expected ok");
    expect(r.result.files).toEqual([{ path: "src/cart.ts", status: "M", bytes: 39, binary: false }]);
    const w = tmp();
    git(w, "init", "-q");
    writeTree(w, { ...BASE, "src/cart.ts": "const DISCOUNT_THRESHOLD_CENTS = 5000;\n" });
    git(w, "add", "-A");
    git(w, "commit", "-q", "-m", "manual");
    expect(r.result.tree_sha).toBe(git(w, "rev-parse", "HEAD^{tree}"));
    expect(existsSync(path.join(tmpRoot, "export.tar"))).toBe(false);
    expect(readdirSync(runDir)).toEqual([]);
    expect(await recomputeTreeSha({ ...m, diffPatch: r.diffPatch, tmpRoot })).toEqual({ treeSha: r.result.tree_sha });
  });

  it("no-op, изтрит файл, node_modules се игнорира", async () => {
    const m = mirror(BASE);
    const same = tmp();
    writeTree(same, BASE);
    const r0 = await exportChangeset({ runId: RUN, ...m, tar: tarOf(same), tarExit: ok, limits, tmpRoot: tmp() });
    expect(r0.result.ok && r0.result.files).toEqual([]);
    if ("diffPatch" in r0) expect(await recomputeTreeSha({ ...m, diffPatch: r0.diffPatch, tmpRoot: tmp() })).toEqual({ treeSha: r0.result.ok ? r0.result.tree_sha : "" });
    const del = tmp();
    const { "src/money.ts": _drop, ...rest } = BASE;
    writeTree(del, { ...rest, "node_modules/x/index.js": "x" });
    const r1 = await exportChangeset({ runId: RUN, ...m, tar: tarOf(del), tarExit: ok, limits, tmpRoot: tmp() });
    expect(r1.result.ok && r1.result.files).toEqual([{ path: "src/money.ts", status: "D", bytes: 0, binary: false }]);
  });

  it("пътища с кирилица и интервал; rename (D-093)", async () => {
    const m = mirror({ ...BASE, "src/а б.ts": "export const ab = 'long enough content for rename detection';\n" });
    const h = tmp();
    const { ...b } = BASE;
    writeTree(h, { ...b, "src/кирилица файл.ts": "x\n", "lib/а б.ts": "export const ab = 'long enough content for rename detection';\n" });
    const r = await exportChangeset({ runId: RUN, ...m, tar: tarOf(h), tarExit: ok, limits, tmpRoot: tmp() });
    if (!r.result.ok) throw new Error("expected ok");
    expect(r.result.files).toContainEqual({ path: "src/кирилица файл.ts", status: "A", bytes: 2, binary: false });
    expect(r.result.files).toContainEqual({ path: "lib/а б.ts", status: "R", old_path: "src/а б.ts", bytes: 62, binary: false });
  });

  it("двоичен ≤ 1 MB минава; recompute дава същото дърво", async () => {
    const m = mirror(BASE);
    const h = tmp();
    writeTree(h, { ...BASE, "src/logo.png": randomBytes(900 * 1024) });
    const r = await exportChangeset({ runId: RUN, ...m, tar: tarOf(h), tarExit: ok, limits, tmpRoot: tmp() });
    if (!r.result.ok || !("diffPatch" in r)) throw new Error("expected ok");
    expect(r.result.files[0]).toMatchObject({ path: "src/logo.png", binary: true });
    expect(await recomputeTreeSha({ ...m, diffPatch: r.diffPatch, tmpRoot: tmp() })).toEqual({ treeSha: r.result.tree_sha });
  });

  it("unreadable, too_many_files, tar_too_large, отказ при symlink", async () => {
    const m = mirror(BASE);
    const h = tmp();
    writeTree(h, BASE);
    const tmpRoot = tmp();
    const un = await exportChangeset({ runId: RUN, ...m, tar: tarOf(h), tarExit: Promise.resolve({ code: 2, stderr: "tar: ./src/x.ts: Cannot open: Permission denied" }), limits, tmpRoot });
    expect(un.result).toEqual({ ok: false, run_id: RUN, reasons: [{ code: "unreadable", path: "src/x.ts" }] });
    const un2 = await exportChangeset({ runId: RUN, ...m, tar: tarOf(h), tarExit: Promise.resolve({ code: 2, stderr: "boom" }), limits, tmpRoot });
    expect(un2.result.ok === false && un2.result.reasons).toEqual([{ code: "unreadable", path: "-" }]);
    const many = tmp();
    writeTree(many, { ...BASE, "src/a.ts": "a", "src/b.ts": "b", "src/c.ts": "c" });
    const tm = await exportChangeset({ runId: RUN, ...m, tar: tarOf(many), tarExit: ok, limits: { ...limits, max_files: 2 }, tmpRoot });
    expect(tm.result.ok === false && tm.result.reasons).toEqual([{ code: "too_many_files", path: "-" }]);
    const two = tmp();
    writeTree(two, { ...BASE, "src/a.ts": "a", "src/b.ts": "b" });
    expect((await exportChangeset({ runId: RUN, ...m, tar: tarOf(two), tarExit: ok, limits: { ...limits, max_files: 2 }, tmpRoot })).result.ok).toBe(true);
    const tl = await exportChangeset({ runId: RUN, ...m, tar: tarOf(h), tarExit: ok, limits, tmpRoot, maxTarBytes: 1000 });
    expect(tl.result.ok === false && tl.result.reasons).toEqual([{ code: "tar_too_large", path: "-" }]);
    expect(existsSync(path.join(tmpRoot, "export.tar"))).toBe(false);
    const sl = await exportChangeset({ runId: RUN, ...m, tar: Readable.from([rawTar([{ path: "src/x", type: "SymbolicLink", linkpath: "/etc/passwd" }])]), tarExit: ok, limits, tmpRoot });
    expect(sl.result.ok === false && sl.result.reasons).toEqual([{ code: "symlink", path: "src/x" }]);
  });

  it("recomputeTreeSha: счупен patch → apply_failed", async () => {
    const m = mirror(BASE);
    expect(await recomputeTreeSha({ ...m, diffPatch: Buffer.from("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-nope\n+yes\n"), tmpRoot: tmp() })).toEqual({ error: "apply_failed" });
  });

  it("чист git: hooks не се пускат", async () => {
    const m = mirror(BASE);
    const sentinel = path.join(tmp(), "sentinel");
    writeFileSync(path.join(m.mirrorPath, "hooks", "post-checkout"), `#!/bin/sh\ntouch ${sentinel}\n`, { mode: 0o755 });
    const c = await cleanClone({ ...m, tmpRoot: tmp(), name: "h" });
    removeTree(c.dir);
    expect(existsSync(sentinel)).toBe(false);
  });

  it("property: същият tree_sha навсякъде", async () => {
    const name = fc.stringMatching(/^[a-z0-9 ._-]{1,8}$|^[а-я]{1,6}$/).filter((n) => !/^\.+$/.test(n) && n.trim() === n && n !== ".git" && !n.startsWith(".git"));
    const content = fc.oneof(fc.string({ maxLength: 2048 }), fc.uint8Array({ maxLength: 1000 }).map((a) => Buffer.from([0, ...a])));
    const tree = fc.dictionary(name, content, { minKeys: 1, maxKeys: 8 });
    await fc.assert(
      fc.asyncProperty(tree, tree, async (baseFiles, headFiles) => {
        const prefixed = (t: Record<string, string | Buffer>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [`src/${k}`, v]));
        const m = mirror(prefixed(baseFiles));
        const h = tmp();
        writeTree(h, prefixed(headFiles));
        const r = await exportChangeset({ runId: RUN, ...m, tar: tarOf(h), tarExit: ok, limits, tmpRoot: tmp() });
        if (!r.result.ok || !("diffPatch" in r)) throw new Error(JSON.stringify(r.result));
        const w = tmp();
        git(w, "init", "-q");
        writeTree(w, prefixed(headFiles));
        git(w, "add", "-A");
        const manual = git(w, "write-tree");
        expect(r.result.tree_sha).toBe(manual);
        expect(await recomputeTreeSha({ ...m, diffPatch: r.diffPatch, tmpRoot: tmp() })).toEqual({ treeSha: manual });
        rmSync(h, { recursive: true, force: true });
      }),
      { numRuns: 25 },
    );
  }, 180_000);
});
