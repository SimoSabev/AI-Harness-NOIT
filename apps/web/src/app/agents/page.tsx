import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "../../components/shell";
import { AgentHex, Meter, Panel, SampleNote, agentTone, initialsOf } from "../../components/workbench-parts";
import { card } from "../../components/ui";
import { pageName } from "../../lib/brand";
import { SAMPLE } from "../../lib/sample";
import { withSample } from "../../lib/workbench";
import type { FleetRow } from "../../lib/workbench";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { sampleOn } from "../../lib/server/sample-pref";
import { fleet } from "../../lib/server/workbench";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Агенти") };

const BY = [{ id: "project", l: "По проект" }, { id: "model", l: "По модел" }, { id: "account", l: "По акаунт" }, { id: "problems", l: "Само проблемите" }] as const;
type By = (typeof BY)[number]["id"];

// D-307 / design H2: every agent and subagent, from one to hundreds, grouped; context, tools, cost, time.
export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const c = await pageCtx();
  const q = (await searchParams).by;
  const by: By = BY.find((b) => b.id === q)?.id ?? "project";
  const src = withSample(await fleet(db(), c.uid, c.org), SAMPLE.fleet.map((r, i, a) => ({ ...r, depth: r.parent_id && a.some((x) => x.id === r.parent_id) ? 1 : 0 })), (x) => x.length === 0, await sampleOn());
  const rows = src.data as (FleetRow & { depth: number })[];
  const count = (s: FleetRow["state"]) => rows.filter((r) => r.state === s && r.role !== "judge").length;
  const key = (r: FleetRow) => (by === "model" ? r.model : by === "account" ? (r.account ?? "без акаунт") : (r.repo ?? "без проект"));
  const shown = by === "problems" ? rows.filter((r) => r.state === "failed" || r.state === "waiting" || (r.context_pct ?? 0) > 80) : rows;
  const groups = [...new Set(shown.map((r) => (by === "problems" ? "проблеми" : key(r))))].map((g) => ({ g, rows: shown.filter((r) => (by === "problems" ? true : key(r) === g)) }));
  const models = [...new Set(rows.map((r) => r.model.split(" · ")[0] as string))].map((m) => ({ m, rows: rows.filter((r) => r.model.startsWith(m)) }));
  const accounts = [...new Set(rows.map((r) => r.account ?? "без акаунт"))].map((a) => ({ a, n: rows.filter((r) => (r.account ?? "без акаунт") === a).length, usd: rows.filter((r) => (r.account ?? "без акаунт") === a).reduce((s, r) => s + r.usd, 0) }));
  const total = rows.reduce((s, r) => s + r.usd, 0);
  return (
    <Shell current="agents" waiting={c.waiting} wide>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Агенти <span className="text-accent-text">{rows.filter((r) => r.role !== "judge").length}</span></h1>
          <p className="mt-1 text-sm text-mute">{count("running")} работят · {count("waiting")} чакат теб · {count("failed")} провал · {count("idle")} свободни · {rows.filter((r) => r.role === "subagent").length} подагента</p>
        </div>
        <nav aria-label="Групиране" className="ml-auto flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
          {BY.map((b) => <Link key={b.id} href={`/agents?by=${b.id}`} aria-current={by === b.id ? "page" : undefined} className="rounded-md px-3 py-1.5 font-display text-xs tracking-wide text-mute hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text">{b.l}</Link>)}
        </nav>
      </div>
      {src.sample && <SampleNote what="агентите и подагентите на всяка задача, техният контекст и цена" table="agent_sessions" />}
      {rows.length === 0 ? (
        <p className={`${card} mt-6 p-6 text-sm text-mute`}>Няма агенти в момента. Дай задача и агентът ще се появи тук.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4 xl:flex-row">
          <div role="region" aria-label="Списък на агентите" tabIndex={0} className={`${card} min-w-0 flex-1 overflow-x-auto`}>
            <table className="w-full min-w-[960px] text-sm">
              <thead><tr className="border-b border-line text-left font-display text-[11px] uppercase tracking-[0.1em] text-mute"><th scope="col" className="w-10 px-4 py-2"><span className="sr-only">Състояние</span></th><th scope="col" className="py-2">Агент · модел</th><th scope="col" className="py-2">Стъпка</th><th scope="col" className="py-2">Инструменти</th><th scope="col" className="w-28 py-2">Контекст</th><th scope="col" className="w-20 py-2 text-right">Цена</th><th scope="col" className="w-24 px-4 py-2 text-right">Време</th></tr></thead>
              {groups.map((g) => (
                <tbody key={g.g}>
                  <tr className="bg-raised"><th colSpan={7} scope="rowgroup" className="px-4 py-1.5 text-left font-display text-xs font-semibold">{g.g} <span className="font-sans font-normal text-mute">· {g.rows.length}</span></th></tr>
                  {g.rows.map((r) => {
                    const t = agentTone(r.state, r.role);
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2"><AgentHex s={r.state} role={r.role} initials={initialsOf(r.agent, r.role)} size="sm" /></td>
                        <td className="py-2" style={{ paddingLeft: r.depth * 18 }}>
                          {r.task_id ? <Link href={`/tasks/${r.task_id}`} className="font-medium">{r.agent}</Link> : <span className="font-medium">{r.agent}</span>}
                          <span className="block font-mono text-[10px] text-mute">{r.model}{r.account ? ` · ${r.account}` : ""}</span>
                        </td>
                        <td className="max-w-[280px] py-2"><span className={`block truncate ${t.text}`}>{t.label}</span><span className="block truncate text-xs text-mute">{r.step}</span></td>
                        <td className="py-2"><span className="flex flex-wrap gap-1">{r.tools.map((x) => <span key={x} className="rounded border border-line px-1.5 font-mono text-[10px] text-mute">{x}</span>)}</span></td>
                        <td className="py-2">{r.context_pct === null ? <span className="text-xs text-mute">—</span> : <><span className={`font-mono text-[11px] ${r.context_pct > 80 ? "text-warn" : "text-mute"}`}>{Math.round(r.context_pct)}%</span><Meter value={r.context_pct} label={`контекст ${r.agent}`} tone={r.context_pct > 80 ? "warn" : "accent"} /></>}</td>
                        <td className="py-2 text-right font-mono text-xs">${r.usd.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-mute">{Math.max(1, Math.round((Date.now() - Date.parse(r.started_at)) / 60000))} мин</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <aside className="flex flex-col gap-4 xl:w-80">
            <Panel title="Рояк по модел">
              <ul className="space-y-2 p-4">
                {models.map((m) => (
                  <li key={m.m} className="flex items-center gap-3 text-sm">
                    <span className="w-28 truncate">{m.m}</span>
                    <span className="flex flex-1 flex-wrap gap-0.5">{m.rows.map((r) => <span key={r.id} aria-hidden="true" className={`hex inline-block h-3 w-3.5 ${agentTone(r.state, r.role).ring} ${r.state === "running" ? "beat" : ""}`} />)}</span>
                    <span className="font-mono text-xs text-mute">{m.rows.length}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Акаунти" aside={`общо $${total.toFixed(2)}`}>
              <ul className="space-y-3 p-4">
                {accounts.map((a) => (
                  <li key={a.a} className="text-sm"><span className="flex justify-between"><span>{a.a}</span><span className="font-mono text-xs text-mute">{a.n} · ${a.usd.toFixed(2)}</span></span><Meter value={a.usd} max={Math.max(total, 0.01)} label={`дял на ${a.a}`} /></li>
                ))}
              </ul>
              <p className="border-t border-line px-4 py-2 text-xs text-mute">Лимитите на абонаментите са в <Link href="/keys" className="underline">Акаунти</Link>.</p>
            </Panel>
          </aside>
        </div>
      )}
    </Shell>
  );
}
