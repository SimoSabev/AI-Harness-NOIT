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
    <Link href={`/tasks/${t.id}`} className="block rounded-lg border border-line bg-panel p-3 transition hover:border-line-strong">
      <StatusBadge tone={s.tone} label={s.label} />
      <p className="mt-2 line-clamp-3 text-sm font-medium">{t.text}</p>
      <p className="mt-1 text-xs text-mute">{agentLabel(t.agent)}</p>
      {tests && <p className="mt-1 font-mono text-xs text-mute">{tests}</p>}
      {ladder && <p className="mt-1 text-xs text-mute">{ladder}</p>}
    </Link>
  );
}
