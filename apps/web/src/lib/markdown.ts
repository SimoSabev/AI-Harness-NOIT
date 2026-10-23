// The agent's Markdown (chat replies, the documents it writes) as plain data for React: no HTML is ever produced or
// injected, links are http(s) or relative only. Small on purpose — headings, paragraphs, lists, tables, quotes, code.
export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; ordered: boolean; items: { text: string; depth: number }[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "quote"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "hr" };
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSep = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row);

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i] ?? "";
    if (l.trim() === "") {
      i++;
      continue;
    }
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(l);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      i++;
      out.push({ kind: "code", lang: fence[1] ?? "", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) {
      out.push({ kind: "heading", level: (h[1] ?? "#").length, text: h[2] ?? "" });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push({ kind: "hr" });
      i++;
      continue;
    }
    if (l.trimStart().startsWith("|") && isSep(lines[i + 1] ?? "")) {
      const head = cells(l);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|")) rows.push(cells(lines[i++] ?? ""));
      out.push({ kind: "table", head, rows });
      continue;
    }
    if (/^\s*>/.test(l)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? "")) body.push((lines[i++] ?? "").replace(/^\s*>\s?/, ""));
      out.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    const li = LIST.exec(l);
    if (li) {
      const ordered = /\d/.test(li[2] ?? "");
      const items: { text: string; depth: number }[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i] ?? "");
        if (!m || (/\d/.test(m[2] ?? "") !== ordered && (m[1] ?? "").length === 0)) break;
        items.push({ text: m[3] ?? "", depth: Math.min(3, Math.floor((m[1] ?? "").replace(/\t/g, "  ").length / 2)) });
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length) {
      const x = lines[i] ?? "";
      if (x.trim() === "" || /^(#{1,6})\s/.test(x) || /^\s*```/.test(x) || /^\s*>/.test(x) || LIST.test(x) || (x.trimStart().startsWith("|") && isSep(lines[i + 1] ?? ""))) break;
      body.push(x);
      i++;
    }
    out.push({ kind: "para", text: body.join("\n") });
  }
  return out;
}

const SAFE = /^(https?:\/\/|\/|\.{0,2}\/|#)[^\s]*$/;
const TOKEN = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(\S(?:.*?\S)?)\*|_(\S(?:.*?\S)?)_|\[([^\]]+)\]\(([^)\s]+)\)/;

export function inline(src: string): Inline[] {
  const out: Inline[] = [];
  const text = (s: string) => {
    if (s === "") return;
    const last = out[out.length - 1];
    if (last?.kind === "text") last.text += s;
    else out.push({ kind: "text", text: s });
  };
  let rest = src;
  for (let m = TOKEN.exec(rest); m; m = TOKEN.exec(rest)) {
    text(rest.slice(0, m.index));
    const [whole, code, s1, s2, e1, e2, label, href] = m;
    if (code !== undefined) out.push({ kind: "code", text: code });
    else if (s1 !== undefined || s2 !== undefined) out.push({ kind: "strong", text: s1 ?? s2 ?? "" });
    else if (e1 !== undefined || e2 !== undefined) out.push({ kind: "em", text: e1 ?? e2 ?? "" });
    else if (label !== undefined && href !== undefined && SAFE.test(href)) out.push({ kind: "link", text: label, href });
    else text(whole);
    rest = rest.slice(m.index + whole.length);
  }
  text(rest);
  return out;
}

/** The whole content of a file the change adds (from its diff lines); null for a changed or deleted file. */
export function addedContent(f: { kind: string; lines: { kind: string; text: string }[] }): string | null {
  if (f.kind !== "added") return null;
  return f.lines.filter((l) => l.kind === "add").map((l) => l.text.slice(1)).join("\n");
}
