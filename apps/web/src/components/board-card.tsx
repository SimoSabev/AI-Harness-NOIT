import Link from "next/link";
import { agentLabel } from "../lib/agents";
import { ladderHint } from "../lib/ladder-hint";
import { statusOf } from "../lib/status";
import { testsOf } from "../lib/verdict-view";
import type { TaskRow } from "../lib/server/queries";
import { StatusBadge } from "./ui";

// Ф4 / D-298: one card on the board — status, what was asked, who, the tests A/B and the agent's place on the ladder.
export function BoardCard({ t }: { t: TaskRow }) {
  const s = statusOf(t);
  const tests = t.a_total !== null || t.inv_before !== null ? testsOf(t) : null;
  const ladder = t.ladder_level !== null && t.ladder_s_up !== null ? ladderHint({ level: t.ladder_level, s_up: t.ladder_s_up, pinned: t.ladder_pinned === true }) : null;
  return (
    <Link href={`/tasks/${t.id}`} className="block rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600">
      <StatusBadge tone={s.tone} label={s.label} />
      <p className="mt-2 line-clamp-3 text-sm font-medium">{t.text}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{agentLabel(t.agent)}</p>
      {tests && <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">{tests}</p>}
      {ladder && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{ladder}</p>}
    </Link>
  );
}
