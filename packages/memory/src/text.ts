// D-400: the text side of memory — a rough token count, terms with a crude stem (bg + en), entities for the graph.
// Deliberately simple and deterministic: the golden set (eval.ts) measures whether it is enough before vectors.

const CYRILLIC = /\p{Script=Cyrillic}/u;

/** Tokens, rounded up: Latin and the rest ~4 chars per token, Cyrillic ~2 (a conservative guess [О]: measured in M4). */
export function estimateTokens(s: string): number {
  let cyr = 0;
  let other = 0;
  for (const ch of s) {
    if (CYRILLIC.test(ch)) cyr++;
    else other++;
  }
  return Math.ceil(other / 4 + cyr / 2);
}

const STOP = new Set([
  "и", "на", "за", "с", "се", "в", "във", "от", "до", "по", "при", "да", "не", "е", "са", "а", "но", "или", "че", "като", "това", "тази", "този",
  "то", "ще", "си", "ги", "го", "я", "ли", "със", "към", "след", "през", "без", "ни", "ми", "ти", "му", "им", "все", "още",
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "be", "with", "at", "by", "it", "this", "that", "as", "from", "not", "no", "do",
]);
// longest first; a suffix goes only if at least 4 (bg) / 3 (en) letters stay
const BG_SUFFIXES = ["овете", "евете", "ията", "ите", "ата", "ята", "ото", "ето", "ове", "еве", "ия", "ът", "ят", "та", "то", "те", "ат", "ам", "ям", "ай", "яй", "аш", "яш", "ем", "еш", "им", "иш", "а", "я", "о", "е", "и", "у"].sort((a, b) => b.length - a.length);
const EN_SUFFIXES = ["ing", "ed", "es", "s"];

function stem(w: string): string {
  const cyr = CYRILLIC.test(w);
  for (const s of cyr ? BG_SUFFIXES : EN_SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= (cyr ? 4 : 3)) return w.slice(0, -s.length);
  }
  return w;
}

/** Search terms: lower case words (letters and digits), stop words out, stemmed, in order (duplicates kept out). */
export function terms(s: string): string[] {
  const out: string[] = [];
  for (const w of s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (STOP.has(w)) continue;
    const t = stem(w);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Exact-duplicate key: lower case, letters and digits only, single spaces. */
export function normalizeKey(s: string): string {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

/** Jaccard similarity of the term sets (0..1). */
export function similarity(a: string, b: string): number {
  const x = new Set(terms(a));
  const y = new Set(terms(b));
  if (x.size === 0 && y.size === 0) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}

/** Tools the graph knows by name (lower case). */
export const KNOWN_TOOLS = Object.freeze([
  "pnpm", "npm", "yarn", "bun", "docker", "colima", "vitest", "jest", "playwright", "git", "github", "gitlab", "node", "typescript", "react", "next",
  "supabase", "postgres", "pglite", "electron", "tailwind", "eslint", "prettier", "turbo", "claude", "codex", "gemini", "python", "vercel",
]);
const PATH = /(?:[\w.-]+\/)+[\w.-]+/g;
const FILE = /\b[\w-]+\.(?:tsx?|m?js|cjs|json|md|ya?ml|sql|py|sh|toml|css|html)\b/gi;
const CODE = /`([^`\n]{1,80})`/g;
const WORD = /[a-z][a-z0-9-]*/g;

/** Entities of a memory: paths, file names, `code`, known tools — lower case, unique, at most 20, in that order. */
export function entitiesOf(s: string): string[] {
  const out: string[] = [];
  const add = (e: string): void => {
    const v = e.trim().toLowerCase();
    if (v && v.length <= 80 && !out.includes(v)) out.push(v);
  };
  const paths = s.match(PATH) ?? [];
  paths.forEach(add);
  for (const f of s.match(FILE) ?? []) if (!paths.some((p) => p.includes(f))) add(f);
  for (const m of s.matchAll(CODE)) add(m[1] ?? "");
  for (const w of s.toLowerCase().match(WORD) ?? []) if (KNOWN_TOOLS.includes(w)) add(w);
  return out.slice(0, 20);
}
