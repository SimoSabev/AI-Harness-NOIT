import type { Metadata } from "next";
import Link from "next/link";
import { Live } from "../components/live";
import { Shell } from "../components/shell";
import { TaskRow } from "../components/task-row";
import { btn, card } from "../components/ui";
import { pageTitle } from "../lib/inbox";
import { GROUP_TITLE, groupOf, statusOf } from "../lib/status";
import type { Group } from "../lib/status";
import { db } from "../lib/server/db";
import { pageCtx } from "../lib/server/page";
import { board } from "../lib/server/queries";
import type { TaskRow as Row } from "../lib/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: pageTitle(c.waiting) };
}

// D-292: the start page = all tasks in three groups; what waits for you is on top.
export default async function TasksPage() {
  const c = await pageCtx();
  const b = await board(db(), c.uid, c.org);
  const all = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1));
  const groups: Record<Group, Row[]> = { waiting: [], active: [], done: [] };
  for (const t of all) groups[groupOf(statusOf(t).key)].push(t);
  return (
    <Shell current="tasks" waiting={groups.waiting.length}>
      <h1 className="text-2xl font-semibold tracking-tight">Задачи</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Агентът прави промяната в пясъчник. Мандат я проверява. Ти решаваш.</p>
      {all.length === 0 ? (
        <div className={`${card} mt-8 flex flex-col items-center px-6 py-14 text-center`}>
          <p className="text-lg font-medium">Още няма задачи</p>
          <p className="mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">Дай задача на агент. Пробвай с демо агент: той работи без ключ и показва как Мандат хваща изтрит тест.</p>
          <Link href="/tasks/new" className={`${btn.primary} mt-6`}>+ Нова задача</Link>
        </div>
      ) : (
        (["waiting", "active", "done"] as const).map((g) =>
          groups[g].length === 0 ? null : (
            <section key={g} aria-labelledby={`g-${g}`} className="mt-8">
              <h2 id={`g-${g}`} className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {GROUP_TITLE[g]} <span className="text-zinc-500 dark:text-zinc-400">{groups[g].length}</span>
              </h2>
              <ul className={`${card} divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-800`}>
                {groups[g].map((t) => (
                  <TaskRow key={t.id} t={t} />
                ))}
              </ul>
            </section>
          ),
        )
      )}
      <Live topic={`org:${c.org}:board`} since={b.since} realtime={c.realtime} fast={groups.active.length > 0} />
    </Shell>
  );
}
