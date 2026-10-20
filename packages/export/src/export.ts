import { createReadStream, createWriteStream, existsSync, readFileSync, readdirSync, chmodSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import * as tar from "tar";
import { sha256Tag } from "@mandat/contract";
import type { ChangedFile, ChangesetExport, ExportReasonCode, ExportRejection, SecurityLimits } from "@mandat/contract";
import { cleanClone, must, parseNameStatus, removeTree } from "./git-tree.js";
import { isBinary, scanTar } from "./tar-scan.js";

export const MAX_TAR_BYTES = 524288000;
const MiB = 1024 * 1024;

/** D-112: stream → <tmpRoot>/export.tar with a byte cap. */
function spool(src: NodeJS.ReadableStream, file: string, max: number): Promise<{ ok: boolean; bytes: number }> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(file);
    let bytes = 0;
    let over = false;
    src.on("data", (c: Buffer) => {
      if (over) return;
      bytes += c.length;
      if (bytes > max) {
        over = true;
        (src as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
        out.end(() => resolve({ ok: false, bytes }));
        return;
      }
      out.write(c);
    });
    src.on("end", () => {
      if (!over) out.end(() => resolve({ ok: true, bytes }));
    });
    src.on("close", () => {
      if (!over) out.end(() => resolve({ ok: true, bytes }));
    });
    src.on("error", (e) => (over ? undefined : reject(e)));
  });
}

/** D-061: first path from tar's stderr ("tar: ./src/x.ts: Cannot open: …") or "-". */
export function unreadablePath(stderr: string): string {
  const m = /tar: (?:\.\/)?([^:\n]+): /.exec(stderr);
  return m?.[1] ?? "-";
}

function emptyWorkTree(dir: string): void {
  for (const n of readdirSync(dir)) if (n !== ".git") rmSync(path.join(dir, n), { recursive: true, force: true });
}

function normalizeModes(dir: string): void {
  for (const n of readdirSync(dir)) {
    if (n === ".git") continue;
    const p = path.join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) {
      chmodSync(p, 0o755);
      normalizeModes(p);
    } else {
      chmodSync(p, st.mode & 0o111 ? 0o755 : 0o644);
    }
  }
}

/**
 * 7.7(1–4). Does NOT write to the run dir: the worker writes diff.patch only after CANARY (D-031).
 * The tar is spooled to <tmpRoot>/export.tar and read twice (scan, extract); it is deleted in finally (D-112).
 */
export async function exportChangeset(o: {
  runId: string;
  mirrorPath: string;
  baseSha: string;
  tar: NodeJS.ReadableStream;
  tarExit: Promise<{ code: number; stderr: string }>;
  limits: SecurityLimits;
  tmpRoot: string;
  maxTarBytes?: number;
}): Promise<{ result: ChangesetExport; diffPatch: Buffer } | { result: ExportRejection }> {
  const file = path.join(o.tmpRoot, "export.tar");
  const reject = (reasons: { code: ExportReasonCode; path: string }[]): { result: ExportRejection } => ({
    result: { ok: false, run_id: o.runId, reasons },
  });
  let head: string | undefined;
  try {
    const spooled = await spool(o.tar, file, o.maxTarBytes ?? MAX_TAR_BYTES);
    if (!spooled.ok) return reject([{ code: "tar_too_large", path: "-" }]);
    const exit = await o.tarExit;
    if (exit.code !== 0) return reject([{ code: "unreadable", path: unreadablePath(exit.stderr) }]);
    const scan = await scanTar(createReadStream(file), { maxFileBytes: o.limits.max_file_mb * MiB, maxBinaryBytes: 1048576, maxTarBytes: 524288000 });
    if (!scan.ok) return reject(scan.reasons);

    const clone = await cleanClone({ mirrorPath: o.mirrorPath, baseSha: o.baseSha, tmpRoot: o.tmpRoot, name: "head" });
    head = clone.dir;
    const git = clone.git;
    emptyWorkTree(head);
    const allowed = new Set(scan.entries.map((e) => e.path));
    await tar.x({
      file,
      cwd: head,
      preserveOwner: false,
      noMtime: true,
      filter: (p, e) => {
        const t = String((e as tar.ReadEntry).type);
        return (t === "File" || t === "OldFile" || t === "ContiguousFile" || t === "Directory") && allowed.has(p.replace(/^(\.\/)+/, "").replace(/\/+$/, ""));
      },
    });
    normalizeModes(head);
    await must(git, ["add", "-A"], head);
    const treeSha = (await must(git, ["write-tree"], head)).toString("utf8").trim();
    const diffPatch = await must(git, ["diff", "--cached", "--binary", "--no-textconv", "--no-ext-diff", "--no-color", "--full-index"], head);
    const ns = parseNameStatus(await must(git, ["-c", "core.quotePath=false", "diff", "--cached", "--name-status", "-M", "-z"], head));
    const files: ChangedFile[] = ns.map((f) => {
      const abs = path.join(head as string, f.path);
      const content = f.status !== "D" && existsSync(abs) ? readFileSync(abs) : Buffer.alloc(0);
      return { ...f, bytes: content.length, binary: isBinary(content) };
    });
    const reasons: { code: ExportReasonCode; path: string }[] = [];
    if (files.length > o.limits.max_files) reasons.push({ code: "too_many_files", path: "-" });
    if (diffPatch.length > o.limits.max_diff_mb * MiB) reasons.push({ code: "diff_too_large", path: "-" });
    if (reasons.length > 0) return reject(reasons);
    return {
      result: { ok: true, run_id: o.runId, base_sha: o.baseSha, tree_sha: treeSha, diff_hash: sha256Tag(diffPatch), diff_bytes: diffPatch.length, files },
      diffPatch,
    };
  } finally {
    rmSync(file, { force: true });
    if (head) removeTree(head);
  }
}
