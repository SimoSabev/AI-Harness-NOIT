import type { Metadata } from "next";
import Link from "next/link";
import { BoardCard } from "../../components/board-card";
import { Live } from "../../components/live";
import { Shell } from "../../components/shell";
import type { ColumnNo } from "../../lib/board";
import { pageTitle } from "../../lib/inbox";
import { statusOf } from "../../lib/status";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { board } from "../../lib/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: `Дъска · ${pageTitle(c.waiting)}` };
}

// т. 8.1 / D-298: the second view, 7 columns by state; no drag-and-drop (a task moves only by the worker or a decision);
// 20 per column + „още“. On a phone the columns scroll sideways (snap), one column per screen.
export default async function BoardPage({ searchParams }: { searchParams: Promise<{ column?: string; before?: string }> }) {
  const c = await pageCtx();
  const q = await searchParams;
  const column = q.column && /^[1-7]$/.test(q.column) ? (Number(q.column) as ColumnNo) : undefined;
  const before = q.before && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(q.before) ? q.before : undefined;
  const raw = await board(db(), c.uid, c.org, { ...(column ? { column } : {}), ...(before ? { before } : {}) });
  // a human-approved change waits in GATED for its delivery; on the board it is already past the decision (col 6), as on its card
  const approved = raw.columns.flatMap((col) => col.items).filter((t) => statusOf(t).key === "approved");
  const b = { ...raw, columns: raw.columns.map((col) => ({ ...col, items: col.n === 6 ? [...approved.filter((t) => t.col !== 6), ...col.items] : col.items.filter((t) => t.col === 6 || statusOf(t).key !== "approved") })) };
  const running = b.columns.some((col) => (col.n === 2 || col.n === 3) && col.items.length > 0);
  return (
    <Shell current="board" waiting={c.waiting} wide>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Дъска</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Всяка задача по пътя си: агент → проверка от Мандат → твоето решение → резултат.</p>
        </div>
        {column && <Link href="/board" className="text-sm underline">Всички колони</Link>}
      </div>
      <div className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:grid lg:grid-cols-7 lg:overflow-visible">
        {b.columns.map((col) => (
          <section key={col.n} aria-labelledby={`col-${col.n}`} className="w-[85vw] shrink-0 snap-start rounded-xl bg-zinc-100 p-2 sm:w-72 lg:w-auto dark:bg-zinc-900/60">
            <h2 id={`col-${col.n}`} className="flex items-center justify-between px-1 pb-2 text-sm font-medium">
              {col.title}
              <span className="rounded-full bg-white px-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{col.items.length}{col.next ? "+" : ""}</span>
            </h2>
            {col.items.length === 0 ? (
              <p className="px-1 py-3 text-xs text-zinc-600 dark:text-zinc-400">Празно</p>
            ) : (
              <ul className="space-y-2">
                {col.items.map((t) => (
                  <li key={t.id}><BoardCard t={t} /></li>
                ))}
              </ul>
            )}
            {col.next && <Link className="mt-2 block px-1 text-xs underline" href={`/board?column=${col.n}&before=${encodeURIComponent(col.next)}`}>Още от „{col.title}“</Link>}
          </section>
        ))}
      </div>
      <Live topic={`org:${c.org}:board`} since={b.since} realtime={c.realtime} fast={running} />
    </Shell>
  );
}
