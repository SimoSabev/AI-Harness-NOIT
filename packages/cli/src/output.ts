import path from "node:path";

export interface Io {
  stdout(s: string): void;
  stderr(s: string): void;
  env: Record<string, string | undefined>;
  cwd: string;
}

/** --json: exactly one line on stdout (6.13). */
export function printJson(io: Io, v: unknown): void {
  io.stdout(JSON.stringify(v) + "\n");
}

export function displayPath(io: Io, p: string): string {
  const rel = path.relative(io.cwd, p);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : p;
}

/** "sha256:9f2c…" style: algorithm, first 12 hex, ellipsis. */
export function shortHash(h: string | undefined | null): string {
  if (!h) return String(h);
  const m = /^sha256:([0-9a-f]{64})$/.exec(h);
  return m ? `sha256:${(m[1] ?? "").slice(0, 12)}…` : h;
}
