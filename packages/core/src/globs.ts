import picomatch from "picomatch";

const cache = new Map<string, (p: string) => boolean>();
/** picomatch with {dot:true} on the POSIX path relative to the tree root (7.2). */
export function globMatch(glob: string, p: string): boolean {
  let m = cache.get(glob);
  if (!m) {
    m = picomatch(glob, { dot: true });
    cache.set(glob, m);
  }
  return m(p);
}
export const firstMatch = (globs: readonly string[], p: string): string | undefined => globs.find((g) => globMatch(g, p));
export const anyMatch = (globs: readonly string[], p: string): boolean => firstMatch(globs, p) !== undefined;

/** D4: "<first dir>/**" or the root file name. */
export function normalizeOutOfContract(p: string): string {
  const i = p.indexOf("/");
  return i < 0 ? p : `${p.slice(0, i)}/**`;
}
