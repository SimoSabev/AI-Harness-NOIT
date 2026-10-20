// A unified diff of whole-file changes (new file or full replacement) for the harness PR (т. 8.2 (9)); the gate's
// createCommit takes a patch. Text files only, LF.
export interface FileChange { path: string; before: string | null; after: string }

const body = (text: string, sign: "+" | "-"): { lines: string[]; noEol: boolean } => {
  if (text === "") return { lines: [], noEol: false };
  const noEol = !text.endsWith("\n");
  const parts = (noEol ? text : text.slice(0, -1)).split("\n");
  return { lines: parts.map((l) => sign + l), noEol };
};

export function filesPatch(changes: FileChange[]): string {
  let out = "";
  for (const c of changes) {
    if (!/^[A-Za-z0-9._/-]+$/.test(c.path) || c.path.includes("..")) throw new Error(`bad path ${c.path}`);
    if (c.before === c.after) continue;
    out += `diff --git a/${c.path} b/${c.path}\n`;
    if (c.before === null) out += "new file mode 100644\n";
    out += `--- ${c.before === null ? "/dev/null" : `a/${c.path}`}\n+++ b/${c.path}\n`;
    const del = c.before === null ? { lines: [], noEol: false } : body(c.before, "-");
    const add = body(c.after, "+");
    out += `@@ -${del.lines.length === 0 ? "0,0" : `1,${del.lines.length}`} +${add.lines.length === 0 ? "0,0" : `1,${add.lines.length}`} @@\n`;
    for (const l of del.lines) out += `${l}\n`;
    if (del.noEol) out += "\\ No newline at end of file\n";
    for (const l of add.lines) out += `${l}\n`;
    if (add.noEol) out += "\\ No newline at end of file\n";
  }
  return out;
}

/** Line diff (LCS) for the ledger/UI: "+ line" / "- line" / "  line". */
export function lineDiff(a: string, b: string): string[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  if (n * m > 4_000_000) return [`- (${n} lines)`, `+ (${m} lines)`];
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) (t[i] as number[])[j] = x[i] === y[j] ? ((t[i + 1] as number[])[j + 1] as number) + 1 : Math.max((t[i + 1] as number[])[j] as number, (t[i] as number[])[j + 1] as number);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push(`  ${x[i]}`);
      i++;
      j++;
    } else if (((t[i + 1] as number[])[j] as number) >= ((t[i] as number[])[j + 1] as number)) out.push(`- ${x[i++]}`);
    else out.push(`+ ${y[j++]}`);
  }
  while (i < n) out.push(`- ${x[i++]}`);
  while (j < m) out.push(`+ ${y[j++]}`);
  return out;
}
