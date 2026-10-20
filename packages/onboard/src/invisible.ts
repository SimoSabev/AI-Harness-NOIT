// Демо промпт т. 8.2 (2), (7), (8): invisible / bidi / Tags characters and shell-download patterns in instruction files.
// Any invisible finding in an existing instruction file blocks the harness approval; the generator output is filtered.
export type InvisibleKind = "bidi" | "tag" | "format" | "control";
export interface InvisibleHit {
  index: number;
  codepoint: string; // "U+202E"
  kind: InvisibleKind;
}

const BIDI = new Set([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);
const ALLOWED_CONTROL = new Set([0x09, 0x0a, 0x0d]);

function kindOf(cp: number, ch: string): InvisibleKind | null {
  if (BIDI.has(cp)) return "bidi";
  if (cp >= 0xe0000 && cp <= 0xe007f) return "tag";
  if (/\p{Cf}/u.test(ch)) return "format";
  if (/\p{Cc}/u.test(ch) && !ALLOWED_CONTROL.has(cp)) return "control";
  return null;
}

export function findInvisible(text: string): InvisibleHit[] {
  const out: InvisibleHit[] = [];
  let i = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    // a BOM at the very start of a file is not hidden text
    const k = i === 0 && cp === 0xfeff ? null : kindOf(cp, ch);
    if (k) out.push({ index: i, codepoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, kind: k });
    i += ch.length;
  }
  return out;
}

export function stripInvisible(text: string): string {
  let out = "";
  let i = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (!(i === 0 && cp === 0xfeff) && kindOf(cp, ch)) {
      i += ch.length;
      continue;
    }
    out += ch;
    i += ch.length;
  }
  return out;
}

const PATTERNS: [string, RegExp][] = [
  ["curl", /\bcurl\b/i],
  ["wget", /\bwget\b/i],
  ["sh -c", /\b(?:ba|z)?sh\s+-c\b/],
  ["base64 -d", /\bbase64\s+(?:-d|--decode)\b/],
  ["pipe to shell", /\|\s*(?:ba|z)?sh\b/],
];

export function dangerousPatterns(text: string): string[] {
  return PATTERNS.filter(([, re]) => re.test(text)).map(([n]) => n);
}
