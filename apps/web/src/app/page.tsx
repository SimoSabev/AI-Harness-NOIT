import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Live } from "../components/live";
import { getT } from "../i18n/server";
import type { T } from "../i18n/t";
import { FlowMap, ProjectColumns, ProjectTiles, Rhythm, Swarm } from "../components/overview-parts";
import { HEALTH, Shell } from "../components/shell";
import { TaskRow } from "../components/task-row";
import { ViewTabs } from "../components/theme-switch";
import { btn, card } from "../components/ui";
import { pageTitle } from "../lib/inbox";
import { overview } from "../lib/overview";
import { parseView } from "../lib/prefs";
import { groupOf, groupTitle, statusOf } from "../lib/status";
import type { Group } from "../lib/status";
import { db } from "../lib/server/db";
import { pageCtx } from "../lib/server/page";
import { board, repos } from "../lib/server/queries";
import { sampleOn } from "../lib/server/sample-pref";
import { homeExtras } from "../lib/server/workbench";
import { SAMPLE } from "../lib/sample";
import { withSample } from "../lib/workbench";
import { Panel, Windows } from "../components/workbench-parts";
import type { TaskRow as Row } from "../lib/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [c, t] = await Promise.all([pageCtx(), getT()]);
  return { title: pageTitle(c.waiting, t.lang) };
}

function Groups({ rows, only, t }: { rows: Row[]; only?: Group[]; t: T }) {
  const groups: Record<Group, Row[]> = { waiting: [], active: [], done: [] };
  for (const t of rows) groups[groupOf(statusOf(t).key)].push(t);
  return (
    <>
      {(only ?? (["waiting", "active", "done"] as const)).map((g) =>
        groups[g].length === 0 ? null : (
          <section key={g} aria-labelledby={`g-${g}`} className="mt-8">
            <h2 id={`g-${g}`} className="mb-2 font-display text-sm font-medium tracking-wide text-mute">
              {groupTitle(g, t.lang)} <span className="font-mono text-mute">{groups[g].length}</span>
            </h2>
            <ul className={`${card} divide-y divide-line overflow-hidden`}>
              {groups[g].map((x) => <TaskRow key={x.id} t={x} tr={t} />)}
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
  const t = await getT();
  const q = await searchParams;
  const [b, r] = await Promise.all([board(db(), c.uid, c.org), repos(db(), c.uid, c.org)]);
  const all = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1));
  const o = overview(all, r, new Date(), t.lang);
  const chosen = q.project ? o.projects.find((p) => p.full_name === q.project) : undefined;
  const view = chosen ? "project" : parseView((await cookies()).get("view")?.value);
  const sel = view === "project" ? (chosen ?? o.projects[0]) : undefined;
  const waiting = all.filter((x) => groupOf(statusOf(x).key) === "waiting").length;
  const ex = withSample(await homeExtras(db(), c.uid, c.org), SAMPLE.home, (x) => x.windows.length === 0 && x.mcpPerMin === 0 && x.conflicts.length === 0 && x.costToday === 0, await sampleOn());
  const decide = all.filter((x) => groupOf(statusOf(x).key) === "waiting").slice(0, 6);
  return (
    <Shell current="tasks" waiting={waiting} wide={view !== "list"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("home.title")}</h1>
          <p className="mt-1 text-sm text-mute">{t("home.intro")}</p>
        </div>
        {all.length > 0 && <ViewTabs value={view} />}
      </div>
      {all.length === 0 ? (
        <div className={`${card} mt-8 flex flex-col items-center px-6 py-14 text-center`}>
          <span aria-hidden="true" className="hex inline-block h-10 w-12 bg-accent/80" />
          <p className="mt-4 font-display text-lg font-medium">{t("home.empty")}</p>
          <p className="mt-1 max-w-md text-sm text-mute">{t("home.emptyHint")}</p>
          <Link href="/tasks/new" className={`${btn.primary} mt-6`}>{t("shell.newTask")}</Link>
        </div>
      ) : view === "list" ? (
        <Groups rows={all} t={t} />
      ) : (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <FlowMap flow={o.flow} t={t} />
          <Swarm swarm={o.swarm} t={t} />
          <ul aria-label={t("home.now")} className="mt-4 flex flex-wrap gap-2 text-sm">
            {ex.data.conflicts.map((k) => <li key={k.path}><Link href="/agents?by=problems" className="inline-flex h-8 items-center gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 text-warn no-underline">{t("home.conflict", { n: k.sessions, path: `${k.repo}/${k.path}` })}</Link></li>)}
            <li className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-mute">{t("home.costToday")} <span className="font-mono text-ink">{t.usd(ex.data.costToday)}</span></li>
            <li><Link href="/tools" className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-mute no-underline">MCP <span className="font-mono text-ink">{t("home.mcpRate", { n: t.num(ex.data.mcpPerMin) })}</span> · {t("home.denied", { n: ex.data.denied24h })}</Link></li>
            {ex.sample && <li className="inline-flex h-8 items-center rounded-lg border border-dashed border-line-strong px-3 text-xs text-warn">{t("sample.badge")} · <Link href="/settings" className="ml-1 underline">{t("sample.hide")}</Link></li>}
          </ul>
          {view === "map" && (
            <>
              <ProjectTiles projects={o.projects} t={t} />
              <Groups rows={all} only={["waiting"]} t={t} />
            </>
          )}
          {view === "columns" && <ProjectColumns projects={o.projects} t={t} />}
          {view === "project" && sel && (
            <div className="mt-6 flex flex-col gap-6 lg:flex-row">
              <nav aria-label={t("home.projects")} className={`${card} h-fit p-2 lg:w-64 lg:shrink-0`}>
                <ul className="space-y-0.5">
                  {o.projects.map((p) => (
                    <li key={p.full_name}>
                      <Link href={`/?project=${encodeURIComponent(p.full_name)}`} aria-current={p.full_name === sel.full_name ? "page" : undefined} className="flex flex-col gap-0.5 rounded-lg px-3 py-2 transition hover:bg-raised aria-[current=page]:bg-accent-soft">
                        <span className="flex items-center gap-2"><span aria-hidden="true" className={`hex inline-block h-2.5 w-3 ${HEALTH[p.health].mark}`} /><span className="font-display text-sm font-semibold">{p.name}</span><span className={`ml-auto text-xs ${HEALTH[p.health].text}`}>{p.word}</span></span>
                        <span className="text-xs text-mute">{t("home.projectLine", { active: p.active, done: p.done24h })}</span>
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
                  <Link href="/harness" className={`${btn.ghost} ml-auto`}>{t("nav.harness")}</Link>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2">
                  {[[t("home.statWaiting"), sel.waiting, "text-warn"], [t("home.statActive"), sel.active, "text-ok"], [t("home.statDone"), sel.done24h, "text-ink"]].map(([l, v, cl]) => (
                    <div key={String(l)} className={`${card} px-4 py-3`}><dt className="text-xs text-mute">{l}</dt><dd className={`font-display text-2xl font-semibold ${cl}`}>{v}</dd></div>
                  ))}
                </dl>
                <Groups rows={all.filter((y) => (sel.id === "" ? !r.some((x) => x.id === y.repo_id) : y.repo_id === sel.id))} t={t} />
                <Rhythm tasks={all.filter((y) => (sel.id === "" ? !r.some((x) => x.id === y.repo_id) : y.repo_id === sel.id))} t={t} />
              </div>
            </div>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          {view !== "map" && <Panel title={t("home.decisions")} aside={String(decide.length)}>
            {decide.length === 0 ? <p className="p-4 text-sm text-mute">{t("home.nothingWaits")}</p> : (
              <ul className="space-y-1.5 p-3">{decide.map((x) => { const st = statusOf(x, t.lang); return <li key={x.id}><Link href={`/tasks/${x.id}`} className="block rounded-lg bg-raised px-3 py-2 no-underline hover:brightness-110"><span className="block truncate text-sm text-ink">{x.text}</span><span className="text-xs text-mute">{st.label}</span></Link></li>; })}</ul>
            )}
          </Panel>}
          <Panel title={t("home.open", { n: ex.data.windows.length })} aside={ex.sample ? t("sample.short") : undefined}><div className="p-3"><Windows windows={ex.data.windows} t={t} /></div></Panel>
        </aside>
        </div>
      )}
      <Live topic={`org:${c.org}:board`} since={b.since} realtime={c.realtime} fast={o.flow.running + o.flow.checking > 0} />
    </Shell>
  );
}
