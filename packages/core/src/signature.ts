/** D-102: "<detector>:<class>:<normalized id>", ≤ 300 chars; CR/LF/TAB → space, trim, empty → "-". Case is kept. */
export function signature(detector: string, cls: string, id: string): string {
  const norm = id.replace(/[\r\n\t]/g, " ").trim() || "-";
  const full = `${detector}:${cls}:${norm}`;
  if (full.length <= 300) return full;
  return full.slice(0, 299) + "…";
}
