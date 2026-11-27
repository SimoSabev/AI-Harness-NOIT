import type { HarnessProfile } from "@mandat/contract";

// D-540 (live test 18.11): the commands a writer may run in the sandbox are the profile's own checks (layer B), in the
// forms a pnpm monorepo needs. A deterministic default, derived from the approved profile only: nothing else gets an
// allow rule, and a command with shell syntax never does (Claude Code splits && ; | itself; a rule must stay a prefix).
const CHECK_KEYS = ["test", "test_one", "lint", "typecheck"] as const;
const WORD = "[A-Za-z0-9@%+=:,./_*-]+";
const SAFE = new RegExp(`^${WORD}( ${WORD})*$`);
const PLACEHOLDER = /\{[a-z_]+\}/g;

const pnpmOf = (p: HarnessProfile): boolean => {
  const r = p.layers.a.runtime;
  return "package_manager" in r && r.package_manager === "pnpm";
};

/** one check command → its command patterns (placeholders → *), or none when it is not a plain command */
function formsOf(command: string, pnpm: boolean): string[] {
  const c = command.trim().replace(PLACEHOLDER, "*").replace(/\s+/g, " ");
  if (!SAFE.test(c)) return [];
  const out = [c];
  if (pnpm && c.startsWith("npx ")) out.push(`pnpm exec ${c.slice(4)}`);
  if (pnpm && c.startsWith("pnpm ") && !/^pnpm (exec|dlx|-)/.test(c)) out.push(`pnpm --filter * ${c.slice(5)}`);
  return out;
}

/** The command patterns of the profile's checks (test, test_one, lint, typecheck), unique, in that order. */
export function checkPatterns(p: HarnessProfile): string[] {
  const cmds = p.layers.b.commands;
  const out: string[] = [];
  for (const k of CHECK_KEYS) {
    const c = cmds[k];
    if (typeof c === "string") for (const f of formsOf(c, pnpmOf(p))) if (!out.includes(f)) out.push(f);
  }
  return out;
}

/** A pattern as Claude Code Bash rules: the command alone and with more arguments ([НП] the inner * of --filter). */
export const bashRules = (pattern: string): string[] => (pattern.endsWith("*") ? [`Bash(${pattern})`] : [`Bash(${pattern} *)`, `Bash(${pattern})`]);


/** D-707: whether a check command is one the writer's shell may run as written (no shell syntax) */
export const plainCheck = (command: string): boolean => formsOf(command, false).length > 0;
