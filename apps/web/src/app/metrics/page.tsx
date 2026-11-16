import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "../../components/shell";
import { card, label } from "../../components/ui";
import { getT } from "../../i18n/server";
import type { T } from "../../i18n/t";
import { metricsOf } from "../../lib/metrics";
import type { Metrics } from "../../lib/metrics";
import { db } from "../../lib/server/db";
import { metricTasks, twinScoreOf } from "../../lib/server/metrics";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("metrics.title") };
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

function Tile({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className={label}>{title}</p>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-mute">{sub}</p>
    </div>
  );
}

/** Accepted changes per week, stacked: without you (accent) under with you (neutral); a 2px gap between the parts. */
function Weeks({ m, t }: { m: Metrics; t: T }) {
  const max = Math.max(1, ...m.weeks.map((w) => w.accepted));
  return (
    <section aria-labelledby="m-weeks" className={`${card} mt-6 px-4 py-4`}>
      <h2 id="m-weeks" className="font-display text-sm font-medium">{t("metrics.weeks")}</h2>
      <ul className="mt-2 flex gap-4 text-xs text-mute" aria-hidden="true">
        <li className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-accent" />{t("metrics.alone")}</li>
        <li className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-line-strong" />{t("metrics.withYou")}</li>
      </ul>
      <div className="mt-4 flex h-40 items-end gap-6 border-b border-line" aria-hidden="true">
        {m.weeks.map((w) => {
          const you = w.accepted - w.withoutYou;
          return (
            <div key={w.from} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={t("metrics.weekTip", { date: w.from, n: w.accepted, alone: w.withoutYou })}>
              {you > 0 && <div className="rounded-t bg-line-strong" style={{ height: `${(you / max) * 100}%` }} />}
              {w.withoutYou > 0 && <div className={`bg-accent ${you > 0 ? "" : "rounded-t"}`} style={{ height: `${(w.withoutYou / max) * 100}%` }} />}
            </div>
          );
        })}
      </div>
      <table className="mt-2 w-full table-fixed text-xs text-mute">
        <caption className="sr-only">{t("metrics.weeks")}</caption>
        <thead className="sr-only"><tr><th>{t("metrics.week")}</th><th>{t("metrics.accepted")}</th><th>{t("metrics.alone")}</th></tr></thead>
        <tbody>
          <tr>
            {m.weeks.map((w) => (
              <td key={w.from} className="px-1 text-center">
                <span className="block font-mono">{w.from.slice(5)}</span>
                <span className="block font-mono text-ink">{w.accepted}<span className="text-mute"> · {w.withoutYou}</span></span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// Round 2: how much got done, how much of it without the person, what an accepted change cost, how well the twin knows
// them. A window of 7 or 30 days (?days=); the weeks chart always shows the last four weeks.
export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const c = await pageCtx();
  const t = await getT();
  const days = (await searchParams).days === "7" ? 7 : 30;
  const [rows, twin] = await Promise.all([metricTasks(db(), c.uid, c.org, Math.max(days, 28)), twinScoreOf(db(), c.uid, c.org)]);
  const m = metricsOf(rows, { now: new Date().toISOString(), days, twin });
  const tab = (d: 7 | 30) => (
    <Link href={`/metrics?days=${d}`} aria-current={days === d ? "page" : undefined}
      className="rounded-lg px-3 py-1.5 text-sm text-mute hover:bg-raised hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text">
      {t(d === 7 ? "metrics.days7" : "metrics.days30")}
    </Link>
  );
  return (
    <Shell current="metrics" waiting={c.waiting}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("metrics.title")}</h1>
          <p className="mt-1 text-sm text-mute">{t("metrics.intro")}</p>
        </div>
        <nav aria-label={t("metrics.window")} className="flex gap-1">{tab(7)}{tab(30)}</nav>
      </div>
      {m.finished === 0 ? (
        <p className={`${card} mt-6 px-4 py-8 text-center text-sm text-mute`}>{t("metrics.empty")}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile title={t("metrics.accepted")} value={String(m.accepted)} sub={t("metrics.acceptedSub", { n: m.finished, pct: pct(m.successRate) })} />
            <Tile title={t("metrics.alone")} value={pct(m.withoutYouRate)} sub={t("metrics.aloneSub", { n: m.withoutYou, twin: m.byTwin, self: m.selfRetries })} />
            <Tile title={t("metrics.cost")} value={m.usdPerAccepted === null ? "—" : t.usd(m.usdPerAccepted)} sub={m.usd > 0 ? t("metrics.costSub", { usd: t.usd(m.usd) }) : t("metrics.costNone")} />
            <Tile title={t("metrics.twin")} value={pct(m.twin.rate)} sub={m.twin.scored === 0 ? t("metrics.twinNone") : t("metrics.twinSub", { correct: m.twin.correct, scored: m.twin.scored })} />
          </div>
          <Weeks m={m} t={t} />
        </>
      )}
    </Shell>
  );
}
