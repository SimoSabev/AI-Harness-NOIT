import type { Metadata } from "next";
import Link from "next/link";
import { BoardHint } from "../../components/board-hint";
import { Live } from "../../components/live";
import { Shell } from "../../components/shell";
import { TaskCard } from "../../components/task-card";
import type { ColumnNo } from "../../lib/board";
import { pageTitle } from "../../lib/inbox";
import { db } from "../../lib/server/db";
import { canAct, pageCtx } from "../../lib/server/page";
import { board } from "../../lib/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: `Дъска · ${pageTitle(c.waiting)}` };
}

// т. 8.1: втори изглед, 7 колони; без drag-and-drop; 20 на колона + „още“.
export default async function BoardPage({ searchParams }: { searchParams: Promise<{ column?: string; before?: string }> }) {
  const c = await pageCtx();
  const q = await searchParams;
  const column = q.column && /^[1-7]$/.test(q.column) ? (Number(q.column) as ColumnNo) : undefined;
  const before = q.before && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(q.before) ? q.before : undefined;
  const b = await board(db(), c.uid, c.org, { ...(column ? { column } : {}), ...(before ? { before } : {}) });
  return (
    <Shell current="board" waiting={c.waiting} wide>
      <h1>Дъска</h1>
      <BoardHint />
      {column && <p><Link href="/board">Всички колони</Link></p>}
      {/* т. 8.4: on a narrow screen the columns are tabs (links + scroll-snap); on desktop this nav is hidden */}
      <nav className="board-tabs" aria-label="Колони">
        {b.columns.map((col) => (
          <a key={col.n} href={`#col-${col.n}`}>{col.title} ({col.items.length})</a>
        ))}
      </nav>
      <div className="board">
        {b.columns.map((col) => (
          <section className="column" key={col.n} aria-labelledby={`col-${col.n}`}>
            <h2 id={`col-${col.n}`}>
              {col.title} <span className="muted">({col.items.length}{col.next ? "+" : ""})</span>
            </h2>
            <ul className="cards">
              {col.items.map((t) => (
                <li key={t.id}>
                  <TaskCard t={t} canAct={canAct(c.role)} compact heading="h3" />
                </li>
              ))}
            </ul>
            {col.next && <p><Link href={`/board?column=${col.n}&before=${encodeURIComponent(col.next)}`}>Още от „{col.title}“</Link></p>}
          </section>
        ))}
      </div>
      <Live topic={`org:${c.org}:board`} since={b.since} realtime={c.realtime} />
    </Shell>
  );
}
