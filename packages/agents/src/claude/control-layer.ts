// v5 SH2: the settings the spike compares (A/B). The profile compiler (E8а) generates the general form.
export interface ClaudeHookCommand { type: "command"; command: string; timeout?: number }
export interface ClaudeSettings {
  permissions: { allow: string[]; deny: string[]; ask: string[] };
  hooks: Partial<Record<"PreToolUse" | "PostToolUse" | "Stop" | "SubagentStop" | "SessionStart", { matcher?: string; hooks: ClaudeHookCommand[] }[]>> & {
    PreToolUse: { matcher?: string; hooks: ClaudeHookCommand[] }[];
  };
  pluginConfigs: Record<string, { options: Record<string, string> }>;
  disableAllHooks?: boolean;
}
export const HOOKS_DIR = "/opt/mandat/hooks";

/** [Ф, anthropic.md §1/§2, 22.10.2026]: permissions deny beats allow; hook exit 2 blocks; instructionFiles managed-only. */
export function sh2Settings(): ClaudeSettings {
  return {
    permissions: { allow: [], deny: ["Bash(git push *)"], ask: [] },
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node ${HOOKS_DIR}/deny-by-policy.mjs`, timeout: 10 }] }] },
    pluginConfigs: { "cc-plugin-agents-md@builtin": { options: { instructionFiles: "managed-only" } } },
  };
}
