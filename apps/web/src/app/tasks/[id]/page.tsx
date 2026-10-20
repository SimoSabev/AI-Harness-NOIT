import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { Live } from "../../../components/live";
import { Shell } from "../../../components/shell";
import { TaskCard } from "../../../components/task-card";
import { pageTitle } from "../../../lib/inbox";
import { ladderHint } from "../../../lib/ladder-hint";
import { reasonText } from "../../../lib/verdict-view";
import { db } from "../../../lib/server/db";
import { canAct, pageCtx } from "../../../lib/server/page";
import { taskDetail } from "../../../lib/server/queries";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "evidence", title: "Доказателства" },
  { id: "diff", title: "Diff" },
  { id: "ladder", title: "Стълба" },
  { id: "ledger", title: "Дневник" },
  { id: "cost", title: "Разход" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const STATUS: Record<string, string> = { pass: "✔ мина", fail: "✖ провал", unknown: "? неизвестно", "n/a": "— не е пускано" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await pageCtx();
  return { title: `${(await params).id} · ${pageTitle(c.waiting)}` };
}

// т. 8.1: табове Доказателства, Diff, Стълба, Дневник, Разход (без Сесия/Памет/Версии).
export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const c = await pageCtx();
  const { id } = await params;
  const want = (await searchParams).tab;
  const tab: Tab = TABS.find((t) => t.id === want)?.id ?? "evidence";
  const d = await taskDetail(db(), c.uid, c.org, c.role, id);
  if (!d) notFound();
  return (
    <Shell current="task" waiting={c.waiting}>
      <p><Link href="/">← Чака теб</Link></p>
      <h1 className="sr-only">Задача {d.task.id}</h1>
      <TaskCard t={d.task} canAct={canAct(c.role)} />
      <nav className="tabs" aria-label="Раздели на задачата">
        {TABS.map((t) => (
          <Link key={t.id} href={`/tasks/${d.task.id}?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined}>{t.title}</Link>
        ))}
      </nav>
      <section aria-labelledby="tab-h">
        <h2 id="tab-h">{TABS.find((t) => t.id === tab)?.title}</h2>
        {tab === "evidence" && (
          d.evidence.length === 0 ? <p>Още няма присъда.</p> : (
            <table>
              <thead><tr><th scope="col">Детектор</th><th scope="col">Статус</th><th scope="col">Обобщение</th></tr></thead>
              <tbody>
                {d.evidence.map((e, k) => (
                  <tr key={`${e.detector}-${k}`}>
                    <td className="mono">{e.detector}</td>
                    <td>{STATUS[e.status] ?? e.status}</td>
                    <td>{e.signature ? reasonText(e.signature) : e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === "diff" && (c.role === "viewer" ? <p>Diff-ът се вижда от одобряващ и собственик.</p> : d.diff ? <pre className="diff mono">{d.diff}</pre> : <p>Няма diff.</p>)}
        {tab === "ladder" && (
          <>
            <p className="level">{d.ladder ? ladderHint(d.ladder) : "Няма стълба за тази двойка (тип, агент)."}</p>
            <ul>
              {d.ladderEvents.map((e, k) => (
                <li key={k}>{e.created_at}: ниво {e.level_before} → {e.level_after} ({e.input === "seed" ? "симулирано" : e.input})</li>
              ))}
            </ul>
          </>
        )}
        {tab === "ledger" && (
          <table>
            <thead><tr><th scope="col">seq</th><th scope="col">Вид</th><th scope="col">Време</th><th scope="col">hash</th></tr></thead>
            <tbody>
              {d.ledger.map((r) => (
                <tr key={r.seq}><td>⌁ {r.seq}</td><td>{r.kind}</td><td>{r.ts}</td><td className="mono">{r.hash.slice(0, 19)}…</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "cost" && (
          <dl>
            <dt>Разход</dt><dd>${d.task.usd.toFixed(4)}</dd>
            <dt>Време</dt><dd>{d.task.minutes.toFixed(1)} мин</dd>
            <dt>Агент</dt><dd>{d.task.agent}</dd>
            {d.approvals.map((a, k) => (<Fragment key={k}><dt>Решение</dt><dd>{a.decision} ({a.method}) · {a.decided_at}</dd></Fragment>))}
          </dl>
        )}
      </section>
      <Live topic={`task:${d.task.id}`} since={new Date().toISOString()} realtime={c.realtime} />
    </Shell>
  );
}
