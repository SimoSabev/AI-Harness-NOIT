// D-299: the agent's change per file (path, added/modified/deleted, +/−), so a reviewer sees the shape before the lines.
export type LineKind = "add" | "del" | "ctx" | "hunk";
export interface DiffFile { path: string; kind: "added" | "modified" | "deleted" | "renamed"; binary: boolean; added: number; removed: number; lines: { kind: LineKind; text: string }[] }

// The header lines git writes between "diff --git" and the first hunk. Inside a hunk the same text ("--- x") is a change.
const HEADER = ["index ", "--- ", "+++ ", "similarity ", "rename ", "old mode", "new mode"];

export function splitDiff(diff: string): DiffFile[] {
  const out: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let inHunk = false;
  for (const l of diff.split("\n")) {
    const head = /^diff --git a\/(.+) b\/(.+)$/.exec(l);
    if (head) {
      cur = { path: head[2] ?? head[1] ?? "", kind: head[1] !== head[2] ? "renamed" : "modified", binary: false, added: 0, removed: 0, lines: [] };
      out.push(cur);
      inHunk = false;
      continue;
    }
    if (!cur || cur.binary) continue; // a binary patch (base85) has nothing a reader can use
    if (!inHunk && l.startsWith("new file mode")) cur.kind = "added";
    else if (!inHunk && l.startsWith("deleted file mode")) cur.kind = "deleted";
    else if (!inHunk && (l === "GIT binary patch" || /^Binary files .* differ$/.test(l))) cur.binary = true;
    else if (!inHunk && HEADER.some((h) => l.startsWith(h))) continue;
    else if (l.startsWith("@@")) {
      inHunk = true;
      cur.lines.push({ kind: "hunk", text: l });
    }
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
