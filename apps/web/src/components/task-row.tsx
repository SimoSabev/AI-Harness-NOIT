import Link from "next/link";
import { agentLabel } from "../lib/agents";
import { ago, statusOf } from "../lib/status";
import { reasonText } from "../lib/verdict-view";
import type { TaskRow as Row } from "../lib/server/queries";
import { StatusBadge } from "./ui";

// D-292: one line per task in the list: status, what was asked, who did it, when; the first reason if it failed.
export function TaskRow({ t }: { t: Row }) {
  const s = statusOf(t);
  const why = s.key === "failed" && t.reasons[0] ? reasonText(t.reasons[0]) : null;
  return (
    <li>
      <Link href={`/tasks/${t.id}`} className="group flex items-start gap-4 px-4 py-3.5 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-900 group-hover:underline dark:text-zinc-100">{t.text}</p>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {agentLabel(t.agent)} · {ago(t.updated_at)}
          </p>
          {why && <p className="mt-1 line-clamp-2 text-sm text-red-700 dark:text-red-400">{why}</p>}
        </div>
        <StatusBadge tone={s.tone} label={s.label} />
      </Link>
    </li>
  );
}
