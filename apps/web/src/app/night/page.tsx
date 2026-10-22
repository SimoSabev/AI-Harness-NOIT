import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "../../components/shell";
import { FlowLines, Meter, Panel, SampleNote } from "../../components/workbench-parts";
import { card } from "../../components/ui";
import { pageName } from "../../lib/brand";
import { SAMPLE } from "../../lib/sample";
import { nightPlan, withSample } from "../../lib/workbench";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { sampleOn } from "../../lib/server/sample-pref";
import { nightView } from "../../lib/server/workbench";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Нощна смяна") };

const t = (iso: string) => new Date(iso).toLocaleTimeString("bg", { hour: "2-digit", minute: "2-digit" });
const RISK = { low: { t: "нисък", c: "text-ok" }, medium: { t: "среден", c: "text-warn" }, high: { t: "висок · чака теб", c: "text-warn" } } as const;
const ITEM = { merged: { m: "✓", c: "text-ok" }, waiting: { m: "?", c: "text-warn" }, failed: { m: "✕", c: "text-bad" } } as Record<string, { m: string; c: string }>;

// D-307 / design H5: the plan for the night — rules, budget, slots by the hour, the queue, and the morning report.
export default async function NightPage() {
  const c = await pageCtx();
  const src = withSample(await nightView(db(), c.uid, c.org), SAMPLE.night, (x) => x.shift === null && x.last === null, await sampleOn());
  const n = src.data;
  const s = n.shift;
  const minutes = s ? Math.max(60, Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000)) : 480;
  const lanes = nightPlan(n.queue, 5, minutes);
  const hours = s ? Array.from({ length: Math.ceil(minutes / 60) }, (_, i) => t(new Date(Date.parse(s.starts_at) + i * 3600_000).toISOString())) : [];
  const rules = s ? [
    { t: `Сливай сам само при ОДОБРЕНА, стълба ниво ${s.rules.auto_merge.min_level} и до ${s.rules.auto_merge.max_lines} реда промяна.`, c: "bg-ok" },
    { t: "Всичко друго чака теб сутринта. Нищо не се трие и нищо не се пуска на живо.", c: "bg-ok" },
    { t: `При провал: върни на агента с причината (до ${s.rules.retries ?? 1} пъти), после паркирай задачата с въпрос към теб; смяната продължава.`, c: "bg-warn" },
    { t: s.rules.same_file === "wait" ? "Два агента в един файл: вторият чака първия." : "Два агента може да пипат един файл.", c: "bg-warn" },
    ...(s.rules.forbid_tools.length ? [{ t: `Забранени през нощта: ${s.rules.forbid_tools.join(", ")}.`, c: "bg-bad" }] : []),
  ] : [];
  return (
    <Shell current="night" waiting={c.waiting} wide>
      <section className={`${card} sweep relative overflow-hidden px-6 py-7`}>
        <FlowLines />
        <div className="relative flex flex-wrap items-end gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Нощна смяна</h1>
            <p className="mt-1 text-sm text-mute">{s ? `${t(s.starts_at)} → ${t(s.ends_at)} · ${n.queue.length} задачи · бюджет $${s.budget_usd}` : "Няма планирана нощ."}</p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center rounded-lg border border-line-strong bg-panel px-4 py-2 font-display text-sm text-ink" disabled title="идва с worker-а на нощната смяна">Пусни 1 задача сега</button>
            <button type="button" className="inline-flex items-center rounded-lg bg-accent px-4 py-2 font-display text-sm font-medium text-accent-ink disabled:opacity-60" disabled title="идва с worker-а на нощната смяна">Потвърди за тази нощ</button>
          </div>
        </div>
      </section>
      {src.sample && <SampleNote what="планът за нощта, опашката и сутрешният доклад" table="night_shifts, night_queue" />}
      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Panel title="Правила на нощта">
            <ul className="space-y-3 p-4 text-sm">{rules.map((r) => <li key={r.t} className="flex gap-2.5"><span aria-hidden="true" className={`hex mt-1 inline-block h-2.5 w-3 shrink-0 ${r.c}`} /><span>{r.t}</span></li>)}{rules.length === 0 && <li className="text-mute">Още няма правила.</li>}</ul>
          </Panel>
          {s && <Panel title="Бюджет"><div className="space-y-2 p-4 text-sm"><span className="flex justify-between"><span>Похарчено</span><span className="font-mono text-xs">${s.spent_usd.toFixed(2)} / ${s.budget_usd}</span></span><Meter value={s.spent_usd} max={s.budget_usd} label="бюджет на нощта" tone="info" /><p className="text-xs text-mute">Спира всичко при тавана; пита при 80%.</p></div></Panel>}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="План по часове" aside="ленти = места за агенти; Мандат проверява всяка задача" className="overflow-x-auto">
            <div className="min-w-[640px] p-4">
              <div className="grid pl-20 font-mono text-[10px] text-mute" style={{ gridTemplateColumns: `repeat(${Math.max(1, hours.length)}, minmax(0, 1fr))` }}>{hours.map((h) => <span key={h}>{h}</span>)}</div>
              {lanes.map((l, i) => (
                <div key={i} className="mt-1.5 flex items-center gap-2">
                  <span className="w-18 shrink-0 font-mono text-[11px] text-mute">място {i + 1}</span>
                  <div className="relative h-7 flex-1 rounded-md bg-raised">
                    {l.map((seg, j) => (
                      <span key={j} title={seg.label} className={`absolute inset-y-0.5 flex items-center overflow-hidden whitespace-nowrap rounded px-2 text-[11px] ${seg.kind === "judge" ? "bg-info-soft text-info" : seg.kind === "risk" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-text"}`} style={{ left: `${seg.left}%`, width: `${seg.width}%` }}>{seg.kind === "judge" ? "М" : seg.label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={`Опашка · ${n.queue.length}`} aside="риск = колко свобода иска задачата">
            <ol className="divide-y divide-line">
              {n.queue.map((q) => <li key={q.position} className="grid grid-cols-[110px_minmax(0,1fr)_120px_70px_60px] gap-3 px-4 py-2 text-sm"><span className="truncate font-mono text-xs text-mute">{q.repo}</span><span className="truncate">{q.text}</span><span className={`text-xs ${RISK[q.risk].c}`}>{RISK[q.risk].t}</span><span className="font-mono text-xs text-mute">~{q.est_minutes} м</span><span className="text-right font-mono text-xs">${q.est_usd.toFixed(2)}</span></li>)}
              {n.queue.length === 0 && <li className="px-4 py-3 text-sm text-mute">Опашката е празна.</li>}
            </ol>
          </Panel>
        </div>
        <Panel title="Сутрешен доклад · миналата нощ">
          {n.last ? (
            <div className="space-y-3 p-4">
              <p className="font-display text-xl font-semibold leading-snug">{n.last.merged} слети сами, {n.last.waiting} чакат теб, {n.last.failed} провал</p>
              <p className="text-sm text-mute">Похарчени ${n.last.spent_usd.toFixed(2)} от ${n.last.budget_usd}.</p>
              <ul className="space-y-1.5">{n.last.items.map((i) => <li key={i.text} className="flex gap-2 rounded-lg bg-raised px-3 py-2 text-sm"><span className={`font-mono ${ITEM[i.status]?.c ?? "text-mute"}`}>{ITEM[i.status]?.m ?? "·"}</span><span className="flex-1">{i.text}</span><span className="font-mono text-[11px] text-mute">{i.repo}</span></li>)}</ul>
              <p className="text-xs text-mute">Пристига в 07:00. Ако няма нищо за теб, само се архивира. <Link href="/" className="underline">Към задачите</Link></p>
            </div>
          ) : <p className="p-4 text-sm text-mute">Още няма изминала нощна смяна.</p>}
        </Panel>
      </div>
    </Shell>
  );
}
