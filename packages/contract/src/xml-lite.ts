// E10 languages (D-680): just enough XML for a junit report — elements, attributes, the five predefined entities and
// character references. Text and CDATA are skipped (a report's failure text is never read). A DOCTYPE (and with it any
// entity definition) is refused, so nothing expands; depth and element count are bounded. No dependency (rule 8).

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}
export type XmlResult = { ok: true; root: XmlElement } | { ok: false; detail: string };

const MAX_DEPTH = 64;
const MAX_ELEMENTS = 500_000;
const NAME = /^[A-Za-z_][\w.:-]*/;
const ENT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(s: string): string | null {
  let bad = false;
  const out = s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);?/g, (m, e: string) => {
    if (!m.endsWith(";")) {
      bad = true;
      return m;
    }
    if (e.startsWith("#")) {
      const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n > 0x10ffff) {
        bad = true;
        return m;
      }
      return String.fromCodePoint(n);
    }
    const v = ENT[e];
    if (v === undefined) bad = true;
    return v ?? m;
  });
  return bad ? null : out;
}

export function parseXml(text: string): XmlResult {
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let count = 0;
  let i = 0;
  const fail = (detail: string): XmlResult => ({ ok: false, detail: `${detail} at ${i}` });
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      if (text.slice(i).trim() !== "" && stack.length === 0) return fail("text outside the root");
      break;
    }
    if (stack.length === 0 && text.slice(i, lt).trim() !== "") return fail("text outside the root");
    i = lt;
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i);
      if (end === -1) return fail("unclosed <?");
      i = end + 2;
      continue;
    }
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end === -1) return fail("unclosed comment");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) {
      if (stack.length === 0) return fail("CDATA outside the root");
      const end = text.indexOf("]]>", i);
      if (end === -1) return fail("unclosed CDATA");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<!", i)) return fail("DOCTYPE/declarations are not accepted");
    if (text.startsWith("</", i)) {
      const m = NAME.exec(text.slice(i + 2, i + 2 + 256));
      const top = stack.pop();
      if (!m || !top || top.name !== m[0]) return fail("mismatched end tag");
      const gt = text.indexOf(">", i);
      if (gt === -1 || text.slice(i + 2 + m[0].length, gt).trim() !== "") return fail("bad end tag");
      i = gt + 1;
      continue;
    }
    const m = NAME.exec(text.slice(i + 1, i + 1 + 256));
    if (!m) return fail("bad tag");
    if (root !== null && stack.length === 0) return fail("second root");
    const el: XmlElement = { name: m[0], attrs: Object.create(null) as Record<string, string>, children: [] };
    if (++count > MAX_ELEMENTS) return fail("too many elements");
    i += 1 + m[0].length;
    let selfClose = false;
    for (;;) {
      while (i < text.length && /\s/.test(text[i] as string)) i++;
      if (text.startsWith("/>", i)) {
        selfClose = true;
        i += 2;
        break;
      }
      if (text[i] === ">") {
        i++;
        break;
      }
      const a = NAME.exec(text.slice(i, i + 256));
      if (!a) return fail("bad attribute");
      i += a[0].length;
      while (/\s/.test(text[i] ?? "")) i++;
      if (text[i] !== "=") return fail("attribute without value");
      i++;
      while (/\s/.test(text[i] ?? "")) i++;
      const q = text[i];
      if (q !== '"' && q !== "'") return fail("unquoted attribute");
      const end = text.indexOf(q, i + 1);
      if (end === -1) return fail("unclosed attribute");
      const raw = text.slice(i + 1, end);
      if (raw.includes("<")) return fail("< in attribute");
      const v = decode(raw);
      if (v === null) return fail("bad entity");
      if (Object.hasOwn(el.attrs, a[0])) return fail("duplicate attribute");
      el.attrs[a[0]] = v;
      i = end + 1;
    }
    const parent = stack.at(-1);
    if (parent) parent.children.push(el);
    else root = el;
    if (!selfClose) {
      if (stack.length >= MAX_DEPTH) return fail("too deep");
      stack.push(el);
    }
  }
  if (stack.length > 0) return fail("unclosed element");
  if (root === null) return fail("no root element");
  return { ok: true, root };
}
