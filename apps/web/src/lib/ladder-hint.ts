import { successesToNextLevel } from "@mandat/core";

// Демо промпт т. 8.1: the visible ladder on the card (spec т. 7).
export function ladderHint(s: { level: number; s_up: number; pinned: boolean }): string {
  if (s.pinned) return `ниво ${s.level} (закрепено)`;
  const n = successesToNextLevel({ level: s.level as 0 | 1 | 2 | 3, s_up: s.s_up, s_down: 0, pinned: false });
  if (n === null) return `ниво ${s.level} (най-високо)`;
  return `ниво ${s.level}, още ${n} ПРОВЕРЕНО до ниво ${s.level + 1}`;
}
