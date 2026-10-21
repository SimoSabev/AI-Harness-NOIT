import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Live } from "../components/live";
import { FlowMap, ProjectColumns, ProjectTiles, Rhythm, Swarm } from "../components/overview-parts";
import { HEALTH, Shell } from "../components/shell";
import { TaskRow } from "../components/task-row";
import { ViewTabs } from "../components/theme-switch";
import { btn, card } from "../components/ui";
import { pageTitle } from "../lib/inbox";
import { overview } from "../lib/overview";
import { parseView } from "../lib/prefs";
import { GROUP_TITLE, groupOf, statusOf } from "../lib/status";
import type { Group } from "../lib/status";
import { db } from "../lib/server/db";
import { pageCtx } from "../lib/server/page";
import { board, repos } from "../lib/server/queries";
import type { TaskRow as Row } from "../lib/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: pageTitle(c.waiting) };
}

function Groups({ rows, only }: { rows: Row[]; only?: Group[] }) {
  const groups: Record<Group, Row[]> = { waiting: [], active: [], done: [] };
  for (const t of rows) groups[groupOf(statusOf(t).key)].push(t);
  return (
    <>
      {(only ?? (["waiting", "active", "done"] as const)).map((g) =>
        groups[g].length === 0 ? null : (
          <section key={g} aria-labelledby={`g-${g}`} className="mt-8">
            <h2 id={`g-${g}`} className="mb-2 font-display text-sm font-medium tracking-wide text-mute">
              {GROUP_TITLE[g]} <span className="font-mono text-mute">{groups[g].length}</span>
            </h2>
            <ul className={`${card} divide-y divide-line overflow-hidden`}>
              {groups[g].map((t) => <TaskRow key={t.id} t={t} />)}
            </ul>
          </section>
        ),
      )}
    </>
  );
}

// D-305: the start page in four views (design S1–S3 + the list); the view is a cookie, ?project= opens one project.
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const c = await pageCtx();
  const q = await searchParams;
  const [b, r] = await Promise.all([board(db(), c.uid, c.org), repos(db(), c.uid, c.org)]);
  const all = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1));
  const o = overview(all, r);
  const chosen = q.project ? o.projects.find((p) => p.full_name === q.project) : undefined;
  const view = chosen ? "project" : parseView((await cookies()).get("view")?.value);
  const sel = view === "project" ? (chosen ?? o.projects[0]) : undefined;
  const waiting = all.filter((t) => groupOf(statusOf(t).key) === "waiting").length;
  return (
    <Shell current="tasks" waiting={waiting} wide={view !== "list"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Задачи</h1>
          <p className="mt-1 text-sm text-mute">Агентът прави промяната в пясъчник. Мандат я проверява. Ти решаваш.</p>
        </div>
        {all.length > 0 && <ViewTabs value={view} />}
      </div>
      {all.length === 0 ? (
        <div className={`${card} mt-8 flex flex-col items-center px-6 py-14 text-center`}>
          <span aria-hidden="true" className="hex inline-block h-10 w-12 bg-accent/80" />
          <p className="mt-4 font-display text-lg font-medium">Още няма задачи</p>
          <p className="mt-1 max-w-md text-sm text-mute">Дай задача на агент. Пробвай с демо агент: той работи без ключ и показва как Мандат хваща изтрит тест.</p>
          <Link href="/tasks/new" className={`${btn.primary} mt-6`}>+ Нова задача</Link>
        </div>
      ) : view === "list" ? (
        <Groups rows={all} />
      ) : (
        <>
          <FlowMap flow={o.flow} />
          <Swarm swarm={o.swarm} />
          {view === "map" && (
            <>
              <ProjectTiles projects={o.projects} />
              <Groups rows={all} only={["waiting"]} />
            </>
          )}
          {view === "columns" && <ProjectColumns projects={o.projects} />}
          {view === "project" && sel && (
            <div className="mt-6 flex flex-col gap-6 lg:flex-row">
              <nav aria-label="Проекти" className={`${card} h-fit p-2 lg:w-64 lg:shrink-0`}>
                <ul className="space-y-0.5">
                  {o.projects.map((p) => (
                    <li key={p.full_name}>
                      <Link href={`/?project=${encodeURIComponent(p.full_name)}`} aria-current={p.full_name === sel.full_name ? "page" : undefined} className="flex flex-col gap-0.5 rounded-lg px-3 py-2 transition hover:bg-raised aria-[current=page]:bg-accent-soft">
                        <span className="flex items-center gap-2"><span aria-hidden="true" className={`hex inline-block h-2.5 w-3 ${HEALTH[p.health].mark}`} /><span className="font-display text-sm font-semibold">{p.name}</span><span className={`ml-auto text-xs ${HEALTH[p.health].text}`}>{p.word}</span></span>
                        <span className="text-xs text-mute">{p.active} в работа · {p.done24h} готови за 24 ч</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span aria-hidden="true" className={`hex inline-block h-4 w-5 ${HEALTH[sel.health].mark}`} />
                  <h2 className="font-display text-xl font-semibold">{sel.name}</h2>
                  <span className="font-mono text-xs text-mute">{sel.full_name}</span>
                  <Link href="/harness" className={`${btn.ghost} ml-auto`}>Правила</Link>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2">
                  {[["Чакат теб", sel.waiting, "text-warn"], ["В работа", sel.active, "text-ok"], ["Готови за 24 ч", sel.done24h, "text-ink"]].map(([l, v, cl]) => (
                    <div key={String(l)} className={`${card} px-4 py-3`}><dt className="text-xs text-mute">{l}</dt><dd className={`font-display text-2xl font-semibold ${cl}`}>{v}</dd></div>
                  ))}
                </dl>
                <Groups rows={all.filter((t) => (sel.id === "" ? !r.some((x) => x.id === t.repo_id) : t.repo_id === sel.id))} />
                <Rhythm tasks={all.filter((t) => (sel.id === "" ? !r.some((x) => x.id === t.repo_id) : t.repo_id === sel.id))} />
              </div>
            </div>
          )}
        </>
      )}
      <Live topic={`org:${c.org}:board`} since={b.since} realtime={c.realtime} fast={o.flow.running + o.flow.checking > 0} />
    </Shell>
  );
}
