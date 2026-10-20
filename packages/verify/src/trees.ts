import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RepoConfig } from "@mandat/contract";
import { anyMatch } from "@mandat/core";
import type { FileSnapshot } from "@mandat/core";

/** All file paths (POSIX, relative) of a tree, without .git and top-level node_modules. */
export function listFiles(root: string, rel = ""): string[] {
  const out: string[] = [];
  for (const n of readdirSync(path.join(root, rel))) {
    if (rel === "" && (n === ".git" || n === "node_modules")) continue;
    const r = rel === "" ? n : `${rel}/${n}`;
    const st = statSync(path.join(root, r));
    if (st.isDirectory()) out.push(...listFiles(root, r));
    else out.push(r);
  }
  return out;
}

export function snapshot(root: string): FileSnapshot {
  return {
    get(p) {
      const f = path.join(root, p);
      return existsSync(f) && statSync(f).isFile() ? readFileSync(f) : null;
    },
  };
}

function copyTree(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const f of listFiles(from)) {
    mkdirSync(path.dirname(path.join(to, f)), { recursive: true });
    cpSync(path.join(from, f), path.join(to, f));
  }
}

/** D-121: package.json protected fields from base; serialisation with 2 spaces + LF. */
export function mergePackageJson(base: Buffer | null, head: Buffer | null, fields: string[]): Buffer | null {
  const parse = (b: Buffer | null): Record<string, unknown> | null | "invalid" => {
    if (b === null) return null;
    try {
      const v: unknown = JSON.parse(b.toString("utf8"));
      return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : "invalid";
    } catch {
      return "invalid";
    }
  };
  const b = parse(base);
  const h = parse(head);
  if (h === "invalid" || b === "invalid" || (h === null && b !== null)) return base;
  if (h === null) return null;
  const baseObj = b ?? {};
  const obj: Record<string, unknown> = { ...h };
  for (const f of fields) {
    if (Object.hasOwn(baseObj, f)) obj[f] = baseObj[f];
    else delete obj[f];
  }
  return Buffer.from(JSON.stringify(obj, null, 2) + "\n");
}

/**
 * 7.8(2): A = head with every path matching test_globs OR protected_paths reverted to base;
 * B = head with only protected_paths reverted. In both, package.json protected fields come from base.
 */
export function buildVerifyTree(o: { baseDir: string; headDir: string; outDir: string; rc: RepoConfig; kind: "a" | "b" }): void {
  copyTree(o.headDir, o.outDir);
  const globs = o.kind === "a" ? [...o.rc.tests.test_globs, ...o.rc.protected_paths] : o.rc.protected_paths;
  const all = new Set([...listFiles(o.baseDir), ...listFiles(o.headDir)]);
  for (const p of all) {
    if (!anyMatch(globs, p)) continue;
    const src = path.join(o.baseDir, p);
    const dst = path.join(o.outDir, p);
    if (existsSync(src)) {
      mkdirSync(path.dirname(dst), { recursive: true });
      cpSync(src, dst);
    } else {
      rmSync(dst, { force: true });
    }
  }
  for (const [file, fields] of Object.entries(o.rc.protected_json_fields)) {
    const merged = mergePackageJson(snapshot(o.baseDir).get(file), snapshot(o.headDir).get(file), fields);
    const dst = path.join(o.outDir, file);
    if (merged === null) rmSync(dst, { force: true });
    else {
      mkdirSync(path.dirname(dst), { recursive: true });
      writeFileSync(dst, merged);
    }
  }
}
