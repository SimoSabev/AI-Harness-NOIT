// Демо промпт т. 8.2 (3): which commands the proposal may contain without a human.
export type CommandClass = "allowed" | "forbidden" | "needs_human";
const ALLOWED_HEADS = new Set(["npx", "pnpm", "npm", "yarn", "bun", "node"]);
const FORBIDDEN_WORDS = /(^|\s)(curl|wget)(\s|$)/;
const FORBIDDEN_SYNTAX = /\|\||\||;|&&|\$\(|`|>|<|\bsh\s+-c\b/;

export function classifyCommand(cmd: string): CommandClass {
  const c = cmd.trim();
  if (c === "" || c.length > 500) return "needs_human";
  if (FORBIDDEN_SYNTAX.test(c) || FORBIDDEN_WORDS.test(c)) return "forbidden";
  const head = c.split(/\s+/)[0] ?? "";
  if (ALLOWED_HEADS.has(head)) return "allowed";
  if (/^(\.\/)?node_modules\/\.bin\/[A-Za-z0-9._-]+$/.test(head)) return "allowed";
  return "needs_human";
}
