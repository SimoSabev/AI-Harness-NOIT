// D-299: the agent's change per file (path, added/modified/deleted, +/−), so a reviewer sees the shape before the lines.
export type LineKind = "add" | "del" | "ctx" | "hunk";
export interface DiffFile { path: string; kind: "added" | "modified" | "deleted" | "renamed"; added: number; removed: number; lines: { kind: LineKind; text: string }[] }

export function splitDiff(diff: string): DiffFile[] {
  const out: DiffFile[] = [];
  let cur: DiffFile | null = null;
  for (const l of diff.split("\n")) {
    const head = /^diff --git a\/(.+) b\/(.+)$/.exec(l);
    if (head) {
      cur = { path: head[2] ?? head[1] ?? "", kind: head[1] !== head[2] ? "renamed" : "modified", added: 0, removed: 0, lines: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (l.startsWith("new file mode")) cur.kind = "added";
    else if (l.startsWith("deleted file mode")) cur.kind = "deleted";
    else if (l.startsWith("index ") || l.startsWith("--- ") || l.startsWith("+++ ") || l.startsWith("similarity ") || l.startsWith("rename ") || l.startsWith("old mode") || l.startsWith("new mode")) continue;
    else if (l.startsWith("@@")) cur.lines.push({ kind: "hunk", text: l });
    else if (l.startsWith("+")) {
      cur.added++;
      cur.lines.push({ kind: "add", text: l });
    } else if (l.startsWith("-")) {
      cur.removed++;
      cur.lines.push({ kind: "del", text: l });
    }
    else if (l !== "" || cur.lines.length > 0) cur.lines.push({ kind: "ctx", text: l });
  }
  for (const f of out) while (f.lines.at(-1)?.kind === "ctx" && f.lines.at(-1)?.text === "") f.lines.pop();
  return out;
}

/** A test file by name (spec/test in the name or a tests/ folder): the reviewer's first look when it is deleted or changed. */
export function isTestPath(p: string): boolean {
  return /(^|\/)(tests?|__tests__)\//.test(p) || /\.(spec|test)\.[cm]?[jt]sx?$/.test(p);
}
