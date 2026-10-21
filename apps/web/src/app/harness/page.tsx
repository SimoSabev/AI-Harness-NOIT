import type { Metadata } from "next";
import { HarnessActions } from "../../components/harness-actions";
import { Live } from "../../components/live";
import { Shell } from "../../components/shell";
import { StatusBadge, card } from "../../components/ui";
import { PROPOSAL_STATUS, fieldLabel, humanFields, sourceLabel } from "../../lib/harness-view";
import { pageTitle } from "../../lib/inbox";
import { db } from "../../lib/server/db";
import { harnessView } from "../../lib/server/harness";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: `Правила · ${pageTitle(c.waiting)}` };
}

// т. 8.2 / D-298: the auto-harness. The scanner reads the repo WITHOUT an LLM and proposes .mandat.yml; every field says
// where it came from; the owner approves with a fresh TOTP code. The approved rules are what Мандат checks against.
export default async function HarnessPage() {
  const c = await pageCtx();
  const v = await harnessView(db(), c.uid, c.org);
  return (
    <Shell current="harness" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Правила на репото</h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        Харнесът сам чете репото (без AI) и предлага правилата: как се инсталира, как се пускат тестовете, кои файлове агентът не пипа.
        Всяко поле казва откъде е взето. Нищо не се одобрява само; агент, който пипне правилата, получава НЕЯСНО.
      </p>
      {v.repos.length === 0 && <p className={`${card} mt-6 p-5 text-sm`}>Няма свързано хранилище. Пусни харнеса с <code className="font-mono">pnpm local</code>.</p>}
      {v.repos.map((r) => {
        const p = r.proposal;
        const st = p ? PROPOSAL_STATUS[p.status] ?? { label: p.status, tone: "gray" as const } : null;
        const confirm = p ? humanFields(p.field_sources) : [];
        return (
          <section key={r.id} aria-labelledby={`r-${r.id}`} className={`${card} mt-6 p-5`}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={`r-${r.id}`} className="font-mono text-base font-semibold">{r.full_name}</h2>
              {st && <StatusBadge tone={st.tone} label={st.label} />}
              {r.harness_stale && <StatusBadge tone="red" label="Правилата в репото са сменени" />}
            </div>
            <p className="mt-1 text-sm text-mute">
              Версия на правилата: {r.config_version}
              {r.config_hash && <span className="font-mono"> · {r.config_hash.slice(7, 15)}</span>}
              {p?.risk_cap !== null && p?.risk_cap !== undefined && <> · най-високо ниво на свобода: {p.risk_cap}</>}
              {p?.pr_number !== null && p?.pr_number !== undefined && <> · PR чернова #{p.pr_number}</>}
            </p>
            {r.harness_stale && <p className="mt-2 text-sm text-bad">Файлът .mandat.yml в репото не съвпада с одобрения. Задачите спират, докато не одобриш нови правила.</p>}
            {p ? (
              <>
                {p.blocked.map((b) => <p key={b} role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">Блокирано: {b}</p>)}
                {(p.needs_human.length > 0 || confirm.length > 0) && (
                  <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                    <p className="font-medium">Провери преди да одобриш:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {p.needs_human.map((n) => <li key={n}>{n}</li>)}
                      {confirm.map((k) => <li key={k}>{fieldLabel(k)}: скенерът не можа да го определи сам</li>)}
                    </ul>
                  </div>
                )}
                {p.warnings.map((w) => <p key={w} className="mt-2 text-sm text-mute">! {w}</p>)}
                <table className="mt-4 w-full text-left text-sm">
                  <caption className="sr-only">Поле и откъде е взето</caption>
                  <thead className="text-xs text-mute"><tr><th scope="col" className="py-1.5 font-medium">Поле</th><th scope="col" className="py-1.5 font-medium">Откъде</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {Object.entries(p.field_sources).sort().map(([k, s]) => (
                      <tr key={k}>
                        <td className="py-2 pr-4">{fieldLabel(k)} <span className="ml-1 font-mono text-xs text-mute">{k}</span></td>
                        <td className={`py-2 ${s === "human" ? "text-warn" : "text-mute"}`}>{sourceLabel(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-mute hover:text-ink">Виж .mandat.yml</summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-raised p-3 font-mono text-xs leading-5">{p.yaml}</pre>
                </details>
              </>
            ) : (
              <p className="mt-3 text-sm">Още няма предложение. „Сканирай репото“ пуска скенера.</p>
            )}
            {c.role === "owner" ? (
              <div className="mt-5">
                <HarnessActions repoId={r.id} proposalId={p?.status === "proposed" && p.blocked.length === 0 ? p.id : null} hasProposal={p !== null} />
              </div>
            ) : (
              <p className="mt-5 text-sm text-mute">Само собственик сканира и одобрява правилата.</p>
            )}
          </section>
        );
      })}
      <Live topic={`org:${c.org}:board`} since={new Date().toISOString()} realtime={c.realtime} />
    </Shell>
  );
}
