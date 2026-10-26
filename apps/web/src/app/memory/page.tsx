import type { Metadata } from "next";
import Link from "next/link";
import type { MemoryItem } from "@mandat/contract";
import { memoryGraph } from "@mandat/memory";
import { AddMemory, MemoryEditor, TidyMemory } from "../../components/memory-actions";
import { MemoryGraphView } from "../../components/memory-graph";
import { Shell } from "../../components/shell";
import { Hex, card, label } from "../../components/ui";
import { getT } from "../../i18n/server";
import type { T } from "../../i18n/t";
import { pageName } from "../../lib/brand";
import { MEMORY_FILTERS, memoryHref, parseMemoryQuery, visibleMemories } from "../../lib/memory-view";
import type { MemoryQuery } from "../../lib/memory-view";
import { ago } from "../../lib/status";
import type { Tone } from "../../lib/status";
import { db } from "../../lib/server/db";
import { memoryHistoryWeb, memoryOverview } from "../../lib/server/memory";
import { canAct, pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("mem.title")) };
}

const TONE: Record<MemoryItem["status"], Tone> = { active: "green", pending: "amber", rejected: "gray", invalid: "gray", archived: "gray" };
const chip = "rounded-full px-3 py-1 text-sm text-mute hover:bg-raised hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text";

function Row({ m, q, t, repos, now }: { m: MemoryItem; q: MemoryQuery; t: T; repos: Record<string, string>; now: Date }) {
  return (
    <li>
      <Link href={memoryHref(q, { id: m.id })} aria-current={q.id === m.id ? "page" : undefined}
        className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-raised aria-[current=page]:bg-accent-soft">
        <Hex tone={TONE[m.status]} className="mt-1.5 h-2 w-2.5" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2">{m.text}</span>
          <span className="block text-[11px] text-mute">
            {t(`mem.kind.${m.kind}`)} · {m.scope === "project" && m.repo_id ? repos[m.repo_id] ?? t("mem.project") : t("mem.filter.mine")}
            {m.status !== "active" && ` · ${t(`mem.status.${m.status}`)}`}{m.pinned && ` · ${t("mem.pinned")}`} · {ago(m.created_at, now, t.lang)}
          </span>
        </span>
      </Link>
    </li>
  );
}

// D-400: the memory menu. Left: what Mandat remembers (list or links), searchable and filtered; right: the chosen memory —
// where it came from, its history, and changing it. On top: what memory costs in tokens.
export default async function MemoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await pageCtx();
  const t = await getT();
  const q = parseMemoryQuery(await searchParams);
  const o = await memoryOverview(db(), c.uid, c.org);
  const shown = visibleMemories(o.items, q);
  const sel = q.id ? o.items.find((m) => m.id === q.id) ?? null : null;
  const history = sel ? await memoryHistoryWeb(db(), c.uid, c.org, sel.id) : [];
  const now = new Date();
  const repoList = Object.entries(o.repos).map(([id, name]) => ({ id, name }));
  const canEdit = (m: MemoryItem) => m.scope === "user" || canAct(c.role);
  const replacedBy = sel?.superseded_by ? o.items.find((m) => m.id === sel.superseded_by) : undefined;
  return (
    <Shell current="memory" waiting={c.waiting} full>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-3">
        <div className="max-w-3xl">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("mem.title")}</h1>
          <p className="mt-1 text-sm text-mute">{t("mem.intro")}</p>
        </div>
        <TidyMemory />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 pb-4 text-xs text-mute">
        <li>{t("mem.stat.core", { tokens: o.tokens.core, fill: o.tokens.fill })}</li>
        <li>{t("mem.stat.all", { tokens: o.tokens.all })}</li>
        <li>{o.usage.runs > 0 ? t("mem.stat.perTask", { avg: o.usage.avg, saved: o.usage.saved_pct }) : t("mem.stat.noTasks")}</li>
        {o.pending > 0 && <li className="text-warn">{t("mem.stat.pending", { n: o.pending })}</li>}
      </ul>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label={t("mem.views")} className="flex gap-1">
              <Link className={chip} href={memoryHref(q, { view: "list" })} aria-current={q.view === "list" ? "page" : undefined}>{t("mem.view.list")}</Link>
              <Link className={chip} href={memoryHref(q, { view: "graph" })} aria-current={q.view === "graph" ? "page" : undefined}>{t("mem.view.graph")}</Link>
            </nav>
            <nav aria-label={t("mem.filters")} className="flex flex-wrap gap-1">
              {MEMORY_FILTERS.map((f) => (
                <Link key={f} className={chip} href={memoryHref(q, { filter: f, id: null })} aria-current={q.filter === f ? "page" : undefined}>{t(`mem.filter.${f}`)}</Link>
              ))}
            </nav>
            <form action="/memory" method="get" className="min-w-48 flex-1">
              {q.view === "graph" && <input type="hidden" name="view" value="graph" />}
              {q.filter !== "all" && <input type="hidden" name="f" value={q.filter} />}
              <input name="q" defaultValue={q.q} placeholder={t("mem.search")} aria-label={t("mem.search")} className="block w-full rounded-lg border border-line-strong bg-canvas px-3 py-1.5 text-sm" />
            </form>
          </div>
          {o.items.length === 0 ? (
            <p className={`${card} p-6 text-sm text-mute`}>{t("mem.empty")}</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-mute">{t("mem.none")}</p>
          ) : q.view === "graph" ? (
            <div className="space-y-2">
              <MemoryGraphView graph={memoryGraph(shown, o.repos)} selected={q.id} href={(id) => memoryHref(q, { id })} youLabel={t("mem.graph.you")} label={t("mem.graph.label")} />
              <p className="text-xs text-mute">{t("mem.graph.legend")}</p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {shown.map((m) => <Row key={m.id} m={m} q={q} t={t} repos={o.repos} now={now} />)}
            </ul>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <section className={`${card} p-4`}>
            <h2 className={label}>{t("mem.add.title")}</h2>
            <div className="mt-3"><AddMemory repos={repoList} canProject={canAct(c.role)} /></div>
          </section>
          <section className={`${card} p-4`} aria-live="polite">
            {sel ? (
              <div className="space-y-3">
                <p className="text-xs text-mute">
                  {t(`mem.status.${sel.status}`)} · {t(`mem.kind.${sel.kind}`)} · {t(`mem.source.${sel.source}`)}{sel.basis && ` (${t(`mem.basis.${sel.basis}`)})`}
                </p>
                {sel.provenance.task_id && <p className="text-xs"><Link className="underline" href={`/?task=${sel.provenance.task_id}`}>{t("mem.detail.task", { task: sel.provenance.task_id })}</Link></p>}
                {sel.entities.length > 0 && <p className="text-xs text-mute">{t("mem.detail.about")}: <span className="font-mono">{sel.entities.join(", ")}</span></p>}
                <p className="text-xs text-mute">{t("mem.detail.used", { n: sel.uses })}</p>
                {replacedBy && <p className="text-xs"><Link className="underline" href={memoryHref(q, { id: replacedBy.id })}>{t("mem.detail.replaced")}: {replacedBy.text}</Link></p>}
                {canEdit(sel) ? <MemoryEditor key={sel.id} item={sel} canEdit after={memoryHref(q, { id: null })} /> : <p className="text-sm">{sel.text}</p>}
                {history.length > 0 && (
                  <div>
                    <h3 className={label}>{t("mem.detail.history")}</h3>
                    <ol className="mt-2 space-y-1 text-xs text-mute">
                      {history.map((e, i) => (
                        <li key={i}>
                          {ago(e.at, now, t.lang)} · {t(`mem.ev.${e.action as "created"}`)} · {t(`mem.actor.${e.actor.startsWith("human:") ? "human" : (e.actor as "agent")}`)}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-mute">{t("mem.select")}</p>
            )}
          </section>
        </aside>
      </div>
    </Shell>
  );
}
