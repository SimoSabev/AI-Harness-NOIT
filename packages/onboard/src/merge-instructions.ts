import { dangerousPatterns, stripInvisible } from "./invisible.js";
import { lineDiff } from "./patch.js";

// E7г (v5 т. 3.4 (3), AC-1.7): several instruction files (AGENTS.md, CLAUDE.md, .cursorrules, GEMINI.md, copilot
// instructions) → one list for the managed block, with the origin of each line and what was left out, and a diff the
// human approves. No AI; invisible characters are removed; lines with dangerous commands are dropped.
export interface MergedLine { text: string; from: string[] }
export interface Merged { lines: MergedLine[]; dropped: { path: string; text: string; why: string }[]; block: string; diff: string[] }
const MAX = 24;

function bullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => stripInvisible(l).trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("@") && !l.startsWith("<!--"))
    .map((l) => l.replace(/^([-*+]|\d+\.)\s+/, "").trim())
    .filter((l) => l.length > 0 && l.length <= 300);
}

export function mergeInstructions(files: { path: string; text: string }[]): Merged {
  const order: string[] = [];
  const from = new Map<string, string[]>();
  const dropped: Merged["dropped"] = [];
  for (const f of files) {
    for (const line of bullets(f.text)) {
      if (dangerousPatterns(line).length > 0) {
        dropped.push({ path: f.path, text: line, why: "dangerous command" });
        continue;
      }
      const key = line.toLowerCase();
      const seen = from.get(key);
      if (seen) {
        if (!seen.includes(f.path)) seen.push(f.path);
      } else {
        from.set(key, [f.path]);
        order.push(line);
      }
    }
  }
  const lines = order.slice(0, MAX).map((text) => ({ text, from: from.get(text.toLowerCase()) ?? [] }));
  const block = lines.length === 0 ? "" : ["## From the existing instruction files", ...lines.map((l) => `- ${l.text} (${l.from.join(", ")})`)].join("\n");
  const before = files.map((f) => `### ${f.path}\n${f.text}`).join("\n");
  return { lines, dropped, block, diff: lineDiff(before, block) };
}
