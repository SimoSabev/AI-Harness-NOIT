// Shared helpers for the toStream parsers (v5 2.1).
export type Json = Record<string, unknown>;
export const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
export const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

export function parseJson(line: string): Json | null {
  try {
    const v: unknown = JSON.parse(line);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

/** A path the agent touched, relative to /m/work; anything outside the work tree → null. */
export function relPath(p: unknown): string | null {
  if (typeof p !== "string" || p.length === 0) return null;
  let s = p.startsWith("/m/work/") ? p.slice("/m/work/".length) : p;
  while (s.startsWith("./")) s = s.slice(2);
  if (s.length === 0 || s.length > 256 || s.startsWith("/") || s.split("/").includes("..")) return null;
  return s;
}
export const paths = (ps: unknown[]): string[] => [...new Set(ps.map(relPath).filter((p): p is string => p !== null))].slice(0, 50);
