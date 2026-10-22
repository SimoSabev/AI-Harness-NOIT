import Link from "next/link";
import type { T } from "../i18n/t";
import { agentLabel } from "../lib/agents";
import { ago, statusOf } from "../lib/status";
import { reasonText } from "../lib/verdict-view";
import type { TaskRow as Row } from "../lib/server/queries";
import { StatusBadge } from "./ui";

// D-292: one line per task in the list: status, what was asked, who did it, when; the first reason if it failed.
export function TaskRow({ t, tr }: { t: Row; tr: T }) {
  const s = statusOf(t, tr.lang);
  const why = s.key === "failed" && t.reasons[0] ? reasonText(t.reasons[0], tr.lang) : null;
  return (
    <li>
      <Link href={`/tasks/${t.id}`} className="group flex items-start gap-4 px-4 py-3.5 transition hover:bg-raised">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink group-hover:underline">{t.text}</p>
          <p className="mt-0.5 text-sm text-mute">
            {agentLabel(t.agent, tr.lang)} · {ago(t.updated_at, new Date(), tr.lang)}
          </p>
          {why && <p className="mt-1 line-clamp-2 text-sm text-bad">{why}</p>}
        </div>
        <StatusBadge tone={s.tone} label={s.label} />
      </Link>
    </li>
  );
}
