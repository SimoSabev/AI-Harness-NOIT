import Link from "next/link";
import type { T } from "../i18n/t";
import { LOCALE, formatUsd } from "../i18n/t";
import type { Lang } from "../i18n/t";
import type { UsageView } from "../lib/usage";
import { card, label } from "./ui";

// D-629: Settings → Models → Usage — what each account and model cost, how much work it did, and what is left (free, or
// in its limit until a time). A server component: the page reads the facts and lib/usage.ts makes the numbers.

const money = (lang: Lang, x: number): string => (x === 0 ? "$0" : x < 0.01 ? "<$0.01" : formatUsd(lang, x));

function Tile({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className={label}>{title}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-mute">{sub}</p>
    </div>
  );
}

export function UsagePanel({ v, days, t }: { v: UsageView; days: 7 | 30; t: T }) {
  const usd = (x: number) => money(t.lang, x);
  const max = Math.max(...v.days.map((d) => d.usd), 0);
  const time = (iso: string) => new Date(iso).toLocaleString(LOCALE[t.lang], { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  const tab = (d: 7 | 30) => (
    <Link href={`/settings/models?days=${d}`} aria-current={days === d ? "page" : undefined}
      className="rounded-full px-3 py-1 text-xs font-medium text-mute transition hover:text-ink aria-[current=page]:bg-raised aria-[current=page]:text-ink">
      {t("usage.days", { n: d })}
    </Link>
  );
  return (
    <section aria-labelledby="usage-h" className="mb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="usage-h" className="font-display text-lg font-semibold">{t("usage.title")}</h2>
        <nav aria-label={t("usage.period")} className="ml-auto inline-flex rounded-full border border-line bg-canvas p-0.5">{tab(7)}{tab(30)}</nav>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile title={t("usage.today")} value={usd(v.totals.today)} sub={t("usage.todaySub")} />
        <Tile title={t("usage.period.total", { n: days })} value={usd(v.totals.period)} sub={t("usage.periodSub", { tasks: v.totals.tasks, chats: v.totals.chats })} />
        <Tile title={t("usage.verified")} value={String(v.totals.verified)} sub={v.totals.perVerified === null ? t("usage.perVerifiedNone") : t("usage.perVerified", { usd: usd(v.totals.perVerified) })} />
        <Tile title={t("usage.minutes")} value={String(Math.round(v.totals.minutes))} sub={t("usage.minutesSub")} />
      </div>

      <div className={`${card} mt-3 px-4 py-4`}>
        <h3 className="text-sm font-medium">{t("usage.perDay")}</h3>
        <div className="mt-3 flex h-28 items-end gap-[3px] border-b border-line" role="img" aria-label={t("usage.perDayAria", { n: days, usd: usd(v.totals.period) })}>
          {v.days.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day} · ${usd(d.usd)}`}>
              <div className={`rounded-t-[2px] ${d.usd > 0 ? "bg-accent" : "bg-line"}`} style={{ height: d.usd > 0 && max > 0 ? `${Math.max(4, (d.usd / max) * 100)}%` : "2px" }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-faint"><span>{v.days[0]?.day.slice(5)}</span><span>{v.days.at(-1)?.day.slice(5)}</span></div>
      </div>

      <div className={`${card} mt-3 overflow-x-auto`}>
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">{t("usage.byAccount")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-mute">
              <th scope="col" className="px-4 py-2 font-medium">{t("usage.col.account")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("usage.col.left")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("usage.col.spent", { n: days })}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.col.today")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.col.work")}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t("usage.col.models")}</th>
            </tr>
          </thead>
          <tbody>
            {v.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-mute">{t("usage.none")}</td></tr>}
            {v.rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                <th scope="row" className="px-4 py-3 text-left font-medium">{r.label}</th>
                <td className="px-3 py-3">
                  {r.left.kind === "limit"
                    ? <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-xs text-warn">{t("usage.left.limit", { when: time(r.left.until) })}</span>
                    : <span className="rounded-md bg-ok-soft px-1.5 py-0.5 text-xs text-ok">{t("usage.left.free")}</span>}
                </td>
                <td className="px-3 py-3">
                  <span className="font-mono">{usd(r.usd)}</span>
                  <span className="ml-2 text-xs text-mute">{Math.round(r.share * 100)}%</span>
                  <span aria-hidden="true" className="mt-1 block h-1.5 w-32 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(r.share * 100)}%` }} /></span>
                </td>
                <td className="px-3 py-3 text-right font-mono">{usd(r.today)}</td>
                <td className="px-3 py-3 text-right text-xs text-mute">{t("usage.work", { tasks: r.tasks, chats: r.chats, ok: r.verified })}</td>
                <td className="px-4 py-3 font-mono text-xs text-mute">{r.models.length === 0 ? "—" : r.models.slice(0, 3).map((m) => `${m.model} ${usd(m.usd)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 max-w-3xl text-xs text-mute">{t("usage.note")}</p>
    </section>
  );
}
