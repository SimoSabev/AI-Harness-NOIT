import * as tar from "tar";
import type { ExportReasonCode } from "@mandat/contract";

export interface ScanEntry {
  path: string;
  type: "File" | "Directory";
  mode: number;
  bytes: number;
}
export type ScanResult = { ok: true; entries: ScanEntry[] } | { ok: false; reasons: { code: ExportReasonCode; path: string }[] };

const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
const TYPE_REASON: Record<string, ExportReasonCode> = {
  SymbolicLink: "symlink",
  Link: "hardlink",
  CharacterDevice: "device",
  BlockDevice: "device",
  FIFO: "fifo",
};

const norm = (p: string): string => p.replace(/^(\.\/)+/, "").replace(/\/+$/, "");

/** 7.7(2), D-127: refuses links, devices, FIFOs, traversal, .git, .gitmodules, non-UTF-8 paths, oversize files. Collects ALL reasons. */
export function scanTar(
  stream: NodeJS.ReadableStream,
  limits: { maxFileBytes: number; maxBinaryBytes: 1048576; maxTarBytes: 524288000 },
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const reasons: { code: ExportReasonCode; path: string }[] = [];
    const seen = new Set<string>();
    const add = (code: ExportReasonCode, path: string): void => {
      const k = `${code}\0${path}`;
      if (!seen.has(k)) {
        seen.add(k);
        reasons.push({ code, path });
      }
    };
    const entries: ScanEntry[] = [];
    const parser = new tar.Parser({ strict: true });
    parser.on("entry", (e: tar.ReadEntry) => {
      const raw = e.path;
      const p = norm(raw);
      if (p === "" || p === ".") {
        e.resume();
        return;
      }
      const comps = p.split("/");
      const before = reasons.length;
      if (raw.startsWith("/") || comps.includes("..")) add("path_traversal", p);
      if (comps.some((c) => c.toLowerCase() === ".git")) add("git_path", p);
      if (p === ".gitmodules") add("gitmodules", p);
      if (p.includes("�")) add("non_utf8_path", p);
      const type = String(e.type);
      if (TYPE_REASON[type]) {
        add(TYPE_REASON[type], p);
        e.resume();
        return;
      }
      if (type === "Directory") {
        if (reasons.length === before) entries.push({ path: p, type: "Directory", mode: e.mode ?? 0o755, bytes: 0 });
        e.resume();
        return;
      }
      if (!FILE_TYPES.has(type)) {
        add("device", p);
        e.resume();
        return;
      }
      const size = e.size ?? 0;
      if (size > limits.maxFileBytes) add("file_too_large", p);
      let head = Buffer.alloc(0);
      e.on("data", (c: Buffer) => {
        if (head.length < 8000) head = Buffer.concat([head, c.subarray(0, 8000 - head.length)]);
      });
      e.on("end", () => {
        const binary = head.includes(0);
        if (binary && size > limits.maxBinaryBytes) add("binary_too_large", p);
        if (reasons.length === before) entries.push({ path: p, type: "File", mode: e.mode ?? 0o644, bytes: size });
      });
    });
    parser.on("ignoredEntry", (e: tar.ReadEntry) => add("device", norm(e.path) || "-"));
    parser.on("error", reject);
    parser.on("end", () => resolve(reasons.length > 0 ? { ok: false, reasons } : { ok: true, entries }));
    stream.on("error", reject);
    stream.pipe(parser as unknown as NodeJS.WritableStream);
  });
}

/** Binary = NUL in the first 8000 bytes (git's heuristic). */
export const isBinary = (b: Buffer): boolean => b.subarray(0, 8000).includes(0);
