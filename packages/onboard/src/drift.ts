import type { MandatPolicy } from "@mandat/contract";

// Демо промпт т. 8.2 Поток 2 минимум: hard fields changed → harness_stale (the task is BLOCKED in CONTRACTED);
// soft fields → a yellow marker only.
export const HARD = ["runtime", "tests", "ci", "monorepo"] as const;
export interface Drift { hard: string[]; soft: string[]; stale: boolean }

const flat = (o: unknown, prefix = ""): Record<string, string> => {
  if (o === null || typeof o !== "object" || Array.isArray(o)) return { [prefix]: JSON.stringify(o) };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) Object.assign(out, flat(v, prefix ? `${prefix}.${k}` : k));
  return out;
};

export function drift(approved: MandatPolicy & { monorepo?: unknown }, current: MandatPolicy & { monorepo?: unknown }): Drift {
  const a = flat(approved);
  const b = flat(current);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
  const isHard = (k: string) => HARD.some((h) => k === h || k.startsWith(`${h}.`));
  const hard = keys.filter(isHard);
  const soft = keys.filter((k) => !isHard(k));
  return { hard, soft, stale: hard.length > 0 };
}
