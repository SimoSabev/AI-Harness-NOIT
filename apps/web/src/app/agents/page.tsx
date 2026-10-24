import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "../../components/shell";
import { AgentHex, Meter, Panel, agentTone, initialsOf } from "../../components/workbench-parts";
import { card } from "../../components/ui";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import type { Key } from "../../i18n/t";
import { pageName } from "../../lib/brand";
import type { FleetRow } from "../../lib/workbench";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { fleet } from "../../lib/server/workbench";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("nav.agents")) };
}

const BY: readonly { id: "project" | "model" | "account" | "problems"; l: Key }[] = [{ id: "project", l: "agents.by.project" }, { id: "model", l: "agents.by.model" }, { id: "account", l: "agents.by.account" }, { id: "problems", l: "agents.by.problems" }];
type By = (typeof BY)[number]["id"];

// D-307 / design H2: every agent and subagent, from one to hundreds, grouped; context, tools, cost, time.
export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const c = await pageCtx();
  const t = await getT();
  const noAccount = t("agents.noAccount");
  const q = (await searchParams).by;
  const by: By = BY.find((b) => b.id === q)?.id ?? "project";
  const rows = (await fleet(db(), c.uid, c.org)) as (FleetRow & { depth: number })[];
  const count = (s: FleetRow["state"]) => rows.filter((r) => r.state === s && r.role !== "judge").length;
  const key = (r: FleetRow) => (by === "model" ? r.model : by === "account" ? (r.account ?? noAccount) : (r.repo ?? t("agents.noProject")));
  const shown = by === "problems" ? rows.filter((r) => r.state === "failed" || r.state === "waiting" || (r.context_pct ?? 0) > 80) : rows;
  const groups = [...new Set(shown.map((r) => (by === "problems" ? t("agents.problems") : key(r))))].map((g) => ({ g, rows: shown.filter((r) => (by === "problems" ? true : key(r) === g)) }));
  const models = [...new Set(rows.map((r) => r.model.split(" · ")[0] as string))].map((m) => ({ m, rows: rows.filter((r) => r.model.startsWith(m)) }));
  const accounts = [...new Set(rows.map((r) => r.account ?? noAccount))].map((a) => ({ a, n: rows.filter((r) => (r.account ?? noAccount) === a).length, usd: rows.filter((r) => (r.account ?? noAccount) === a).reduce((s, r) => s + r.usd, 0) }));
  const total = rows.reduce((s, r) => s + r.usd, 0);
  return (
    <Shell current="agents" waiting={c.waiting} wide>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("nav.agents")} <span className="text-accent-text">{rows.filter((r) => r.role !== "judge").length}</span></h1>
          <p className="mt-1 text-sm text-mute">{t("agents.summary", { running: count("running"), waiting: count("waiting"), failed: count("failed"), idle: count("idle"), sub: rows.filter((r) => r.role === "subagent").length })}</p>
        </div>
        <nav aria-label={t("agents.grouping")} className="ml-auto flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
          {BY.map((b) => <Link key={b.id} href={`/agents?by=${b.id}`} aria-current={by === b.id ? "page" : undefined} className="rounded-md px-3 py-1.5 font-display text-xs tracking-wide text-mute hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text">{t(b.l)}</Link>)}
        </nav>
      </div>
      {rows.length === 0 ? (
        <p className={`${card} mt-6 p-6 text-sm text-mute`}>{t("agents.none")}</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4 xl:flex-row">
          <div role="region" aria-label={t("agents.list")} tabIndex={0} className={`${card} min-w-0 flex-1 overflow-x-auto`}>
            <table className="w-full min-w-[960px] text-sm">
              <thead><tr className="border-b border-line text-left font-display text-[11px] uppercase tracking-[0.1em] text-mute"><th scope="col" className="w-10 px-4 py-2"><span className="sr-only">{t("agents.col.state")}</span></th><th scope="col" className="py-2">{t("agents.col.agent")}</th><th scope="col" className="py-2">{t("agents.col.step")}</th><th scope="col" className="py-2">{t("agents.col.tools")}</th><th scope="col" className="w-28 py-2">{t("agents.col.context")}</th><th scope="col" className="w-20 py-2 text-right">{t("agents.col.cost")}</th><th scope="col" className="w-24 px-4 py-2 text-right">{t("agents.col.time")}</th></tr></thead>
              {groups.map((g) => (
                <tbody key={g.g}>
                  <tr className="bg-raised"><th colSpan={7} scope="rowgroup" className="px-4 py-1.5 text-left font-display text-xs font-semibold">{g.g} <span className="font-sans font-normal text-mute">· {g.rows.length}</span></th></tr>
                  {g.rows.map((r) => {
                    const tone = agentTone(r.state, r.role);
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2"><AgentHex s={r.state} role={r.role} initials={initialsOf(r.agent, r.role)} size="sm" /></td>
                        <td className="py-2" style={{ paddingLeft: r.depth * 18 }}>
                          {r.task_id ? <Link href={`/tasks/${r.task_id}`} className="font-medium">{r.agent}</Link> : <span className="font-medium">{r.agent}</span>}
                          <span className="block font-mono text-[10px] text-mute">{r.model}{r.account ? ` · ${r.account}` : ""}</span>
                        </td>
                        <td className="max-w-[280px] py-2"><span className={`block truncate ${tone.text}`}>{t(tone.label)}</span><span className="block truncate text-xs text-mute">{r.step}</span></td>
                        <td className="py-2"><span className="flex flex-wrap gap-1">{r.tools.map((x) => <span key={x} className="rounded border border-line px-1.5 font-mono text-[10px] text-mute">{x}</span>)}</span></td>
                        <td className="py-2">{r.context_pct === null ? <span className="text-xs text-mute">—</span> : <><span className={`font-mono text-[11px] ${r.context_pct > 80 ? "text-warn" : "text-mute"}`}>{Math.round(r.context_pct)}%</span><Meter value={r.context_pct} label={t("wb.context", { agent: r.agent })} tone={r.context_pct > 80 ? "warn" : "accent"} /></>}</td>
                        <td className="py-2 text-right font-mono text-xs">{t.usd(r.usd)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-mute">{t("agents.minutes", { n: Math.max(1, Math.round((Date.now() - Date.parse(r.started_at)) / 60000)) })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <aside className="flex flex-col gap-4 xl:w-80">
            <Panel title={t("agents.swarm")}>
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
            <Panel title={t("agents.accounts")} aside={t("agents.total", { usd: t.usd(total) })}>
              <ul className="space-y-3 p-4">
                {accounts.map((a) => (
                  <li key={a.a} className="text-sm"><span className="flex justify-between"><span>{a.a}</span><span className="font-mono text-xs text-mute">{a.n} · {t.usd(a.usd)}</span></span><Meter value={a.usd} max={Math.max(total, 0.01)} label={t("agents.share", { a: a.a })} /></li>
                ))}
              </ul>
              <p className="border-t border-line px-4 py-2 text-xs text-mute">{rich(t("agents.limits"), { link: <Link href="/keys" className="underline">{t("nav.keys")}</Link> })}</p>
            </Panel>
          </aside>
        </div>
      )}
    </Shell>
  );
}
