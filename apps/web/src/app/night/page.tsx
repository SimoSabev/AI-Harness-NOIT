import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "../../components/shell";
import { FlowLines, Meter, Panel } from "../../components/workbench-parts";
import { card } from "../../components/ui";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import type { Key } from "../../i18n/t";
import { pageName } from "../../lib/brand";
import { NightPlanForm } from "../../components/night-plan-form";
import { NightQuestions } from "../../components/night-questions";
import { nightPlan } from "../../lib/workbench";
import { db } from "../../lib/server/db";
import { canAct, pageCtx } from "../../lib/server/page";
import { nightView } from "../../lib/server/workbench";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("night.title")) };
}

const RISK: Record<"low" | "medium" | "high", { t: Key; c: string }> = { low: { t: "night.risk.low", c: "text-ok" }, medium: { t: "night.risk.medium", c: "text-warn" }, high: { t: "night.risk.high", c: "text-warn" } };
const ITEM = { merged: { m: "✓", c: "text-ok" }, waiting: { m: "?", c: "text-warn" }, failed: { m: "✕", c: "text-bad" }, parked: { m: "‖", c: "text-warn" }, running: { m: "▶", c: "text-info" }, skipped: { m: "–", c: "text-mute" } } as Record<string, { m: string; c: string }>;

// D-307 / design H5: the plan for the night — rules, budget, slots by the hour, the queue, and the morning report.
export default async function NightPage() {
  const c = await pageCtx();
  const tr = await getT();
  const t = (iso: string) => new Date(iso).toLocaleTimeString(tr.locale, { hour: "2-digit", minute: "2-digit" });
  const n = await nightView(db(), c.uid, c.org);
  const s = n.shift;
  const minutes = s ? Math.max(60, Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000)) : 480;
  const lanes = nightPlan(n.queue, 5, minutes, 8, tr.lang);
  const hours = s ? Array.from({ length: Math.ceil(minutes / 60) }, (_, i) => t(new Date(Date.parse(s.starts_at) + i * 3600_000).toISOString())) : [];
  const rules = s ? [
    { t: tr("night.rule.merge", { level: s.rules.auto_merge.min_level, lines: s.rules.auto_merge.max_lines }), c: "bg-ok" },
    { t: tr("night.rule.rest"), c: "bg-ok" },
    { t: tr("night.rule.fail", { n: s.rules.retries ?? 1 }), c: "bg-warn" },
    { t: s.rules.same_file === "wait" ? tr("night.rule.sameFileWait") : tr("night.rule.sameFileAllow"), c: "bg-warn" },
    ...(s.rules.forbid_tools.length ? [{ t: tr("night.rule.forbid", { tools: s.rules.forbid_tools.join(", ") }), c: "bg-bad" }] : []),
  ] : [];
  return (
    <Shell current="night" waiting={c.waiting} wide>
      <section className={`${card} sweep relative overflow-hidden px-6 py-7`}>
        <FlowLines />
        <div className="relative flex flex-wrap items-end gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{tr("night.title")}</h1>
            <p className="mt-1 text-sm text-mute">{s ? tr("night.header", { start: t(s.starts_at), end: t(s.ends_at), n: n.queue.length, usd: `$${tr.num(s.budget_usd)}` }) : tr("night.none")}</p>
          </div>
        </div>
      </section>
      {/* E9a: a plan when no night is open (night.manage is checked by the server) */}
      {!s && canAct(c.role) && <div className={`${card} mt-4`}><NightPlanForm repos={n.repos} /></div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Panel title={tr("night.rules")}>
            <ul className="space-y-3 p-4 text-sm">{rules.map((r) => <li key={r.t} className="flex gap-2.5"><span aria-hidden="true" className={`hex mt-1 inline-block h-2.5 w-3 shrink-0 ${r.c}`} /><span>{r.t}</span></li>)}{rules.length === 0 && <li className="text-mute">{tr("night.noRules")}</li>}</ul>
          </Panel>
          {s && <Panel title={tr("night.budget")}><div className="space-y-2 p-4 text-sm"><span className="flex justify-between"><span>{tr("night.spent")}</span><span className="font-mono text-xs">{tr.usd(s.spent_usd)} / ${tr.num(s.budget_usd)}</span></span><Meter value={s.spent_usd} max={s.budget_usd} label={tr("night.budgetMeter")} tone="info" /><p className="text-xs text-mute">{tr("night.budgetHint")}</p></div></Panel>}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={tr("night.plan")} aside={tr("night.planAside")} className="overflow-x-auto">
            <div className="min-w-[640px] p-4">
              <div className="grid pl-20 font-mono text-[10px] text-mute" style={{ gridTemplateColumns: `repeat(${Math.max(1, hours.length)}, minmax(0, 1fr))` }}>{hours.map((h) => <span key={h}>{h}</span>)}</div>
              {lanes.map((l, i) => (
                <div key={i} className="mt-1.5 flex items-center gap-2">
                  <span className="w-18 shrink-0 font-mono text-[11px] text-mute">{tr("night.slot", { n: i + 1 })}</span>
                  <div className="relative h-7 flex-1 rounded-md bg-raised">
                    {l.map((seg, j) => (
                      <span key={j} title={seg.label} className={`absolute inset-y-0.5 flex items-center overflow-hidden whitespace-nowrap rounded px-2 text-[11px] ${seg.kind === "judge" ? "bg-info-soft text-info" : seg.kind === "risk" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-text"}`} style={{ left: `${seg.left}%`, width: `${seg.width}%` }}>{seg.kind === "judge" ? tr("night.judgeMark") : seg.label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={tr("night.queue", { n: n.queue.length })} aside={tr("night.queueAside")}>
            <ol className="divide-y divide-line">
              {n.queue.map((q) => <li key={q.position} className="grid grid-cols-[110px_minmax(0,1fr)_120px_70px_60px] gap-3 px-4 py-2 text-sm"><span className="truncate font-mono text-xs text-mute">{q.repo}</span><span className="truncate">{q.status !== "queued" && <span className={`mr-2 font-mono text-xs ${ITEM[q.status]?.c ?? "text-mute"}`}>{ITEM[q.status]?.m ?? "·"}</span>}{q.text}</span><span className={`text-xs ${RISK[q.risk].c}`}>{tr(RISK[q.risk].t)}</span><span className="font-mono text-xs text-mute">{tr("night.estMinutes", { n: q.est_minutes })}</span><span className="text-right font-mono text-xs">{tr.usd(q.est_usd)}</span></li>)}
              {n.queue.length === 0 && <li className="px-4 py-3 text-sm text-mute">{tr("night.queueEmpty")}</li>}
            </ol>
          </Panel>
        </div>
        <Panel title={tr("night.report")}>
          {n.last ? (
            <div className="space-y-3 p-4">
              <p className="font-display text-xl font-semibold leading-snug">{tr("night.reportLine", { merged: n.last.merged, waiting: n.last.waiting, failed: n.last.failed })}</p>
              <p className="text-sm text-mute">{tr("night.reportSpent", { spent: tr.usd(n.last.spent_usd), budget: `$${tr.num(n.last.budget_usd)}` })}{n.last.parked > 0 && <> · {tr("night.reportParked", { n: n.last.parked })}</>}</p>
              <ul className="space-y-1.5">{n.last.items.map((i) => <li key={i.text} className="flex gap-2 rounded-lg bg-raised px-3 py-2 text-sm"><span className={`font-mono ${ITEM[i.status]?.c ?? "text-mute"}`}>{ITEM[i.status]?.m ?? "·"}</span><span className="flex-1">{i.text}</span><span className="font-mono text-[11px] text-mute">{i.repo}</span></li>)}</ul>
              <p className="text-xs text-mute">{rich(tr("night.reportHint"), { link: <Link href="/" className="underline">{tr("night.toTasks")}</Link> })}</p>
            </div>
          ) : <p className="p-4 text-sm text-mute">{tr("night.noReport")}</p>}
          <h3 className="border-t border-line px-4 pt-3 text-sm font-medium">{tr("night.questions")}</h3>
          <NightQuestions questions={n.questions} />
        </Panel>
      </div>
    </Shell>
  );
}
