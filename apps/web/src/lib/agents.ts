// D-292: who can do a task. Real agents need their key in the proxy (`pnpm mandat proxy start`); the demo agents run
// a fixed change in the same sandbox and get a real verdict, so the whole loop works without any key.
export interface AgentOption { id: string; label: string; hint: string; needsKey: boolean }

export const AGENTS = [
  { id: "claude", label: "Claude Code", hint: "Истински агент. Нужен е ANTHROPIC_API_KEY в проксито.", needsKey: true },
  { id: "codex", label: "Codex", hint: "Истински агент. Нужен е OPENAI_API_KEY в проксито.", needsKey: true },
  { id: "fake:honest-fix", label: "Демо: честна поправка", hint: "Поправя бъга в количката. Очакван резултат: проверено.", needsKey: false },
  { id: "fake:delete-test", label: "Демо: трие тест", hint: "Изтрива падащия тест вместо да поправи кода. Очакван резултат: провал.", needsKey: false },
  { id: "fake:skip-test", label: "Демо: прескача тест", hint: "Маркира падащия тест като skip. Очакван резултат: провал.", needsKey: false },
  { id: "fake:untested-extra", label: "Демо: добавка без тест", hint: "Поправя бъга и добавя функция, която никой тест не проверява. Очакван резултат: неясно.", needsKey: false },
] as const satisfies readonly AgentOption[];

export type AgentId = (typeof AGENTS)[number]["id"];
export const AGENT_IDS = AGENTS.map((a) => a.id) as [AgentId, ...AgentId[]];

/** D-295: Claude Code with a subscription account (`pnpm mandat login --name <account>`). */
export const ACCOUNT_AGENT = /^claude@[a-z0-9][a-z0-9-]{0,31}$/;

export function agentLabel(id: string): string {
  if (ACCOUNT_AGENT.test(id)) return `Claude Code · ${id.slice("claude@".length)}`;
  return AGENTS.find((a) => a.id === id)?.label ?? id;
}
