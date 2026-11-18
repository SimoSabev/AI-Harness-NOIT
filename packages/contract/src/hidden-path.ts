// D-536 (live test 18.11.2026, a pnpm monorepo whose vitest workspace is `packages/*`): hidden test files live in a
// `__hidden__` folder at any depth, so they sit where the project's own runner discovers tests. A hidden path is
// relative to the repo root, uses "/", has no "." / ".." / empty segment, has a `__hidden__` folder and a file under it.

export const HIDDEN_SEGMENT = "__hidden__";

export function isHiddenPath(p: string): boolean {
  if (p.length === 0 || p.length > 300 || p.includes("\\") || /^[a-zA-Z]:/.test(p)) return false;
  const segs = p.split("/");
  if (segs.some((s) => s === "" || s === "." || s === "..")) return false;
  const at = segs.indexOf(HIDDEN_SEGMENT);
  return at >= 0 && at < segs.length - 1;
}

/** a stored hidden file's path from the repo root: an oracle's paths already are (dir ""); a legacy set joins its dir */
export function hiddenRootPath(dir: string, p: string): string {
  const d = dir.replace(/\/+$/, "");
  return d === "" ? p : `${d}/${p}`;
}

/** the file part of a test id (D-025: "<file relative to the tree root> > …") */
export const hiddenFileOf = (testId: string): string => testId.split(" > ")[0] ?? "";
