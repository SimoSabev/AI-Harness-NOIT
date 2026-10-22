import type { Metadata } from "next";
import { HarnessActions } from "../../components/harness-actions";
import { Live } from "../../components/live";
import { Shell } from "../../components/shell";
import { StatusBadge, card } from "../../components/ui";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import { fieldLabel, humanFields, proposalStatus, sourceLabel } from "../../lib/harness-view";
import { pageTitle } from "../../lib/inbox";
import { db } from "../../lib/server/db";
import { harnessView } from "../../lib/server/harness";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [c, t] = await Promise.all([pageCtx(), getT()]);
  return { title: `${t("nav.harness")} · ${pageTitle(c.waiting, t.lang)}` };
}

// §8.2 / D-298: the auto-harness. The scanner reads the repo WITHOUT an LLM and proposes .mandat.yml; every field says
// where it came from; the owner approves with a fresh TOTP code. The approved rules are what Mandat checks against.
export default async function HarnessPage() {
  const c = await pageCtx();
  const t = await getT();
  const lang = t.lang;
  const v = await harnessView(db(), c.uid, c.org);
  return (
    <Shell current="harness" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("harness.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        {t("harness.intro")} {t("harness.intro2")}
      </p>
      {v.repos.length === 0 && <p className={`${card} mt-6 p-5 text-sm`}>{rich(t("common.noRepo"), { cmd: <code className="font-mono">pnpm local</code> })}</p>}
      {v.repos.map((r) => {
        const p = r.proposal;
        const st = p ? proposalStatus(p.status, lang) : null;
        const confirm = p ? humanFields(p.field_sources) : [];
        return (
          <section key={r.id} aria-labelledby={`r-${r.id}`} className={`${card} mt-6 p-5`}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={`r-${r.id}`} className="font-mono text-base font-semibold">{r.full_name}</h2>
              {st && <StatusBadge tone={st.tone} label={st.label} />}
              {r.harness_stale && <StatusBadge tone="red" label={t("harness.stale")} />}
            </div>
            <p className="mt-1 text-sm text-mute">
              {t("harness.version", { v: r.config_version })}
              {r.config_hash && <span className="font-mono"> · {r.config_hash.slice(7, 15)}</span>}
              {p?.risk_cap !== null && p?.risk_cap !== undefined && t("harness.riskCap", { n: p.risk_cap })}
              {p?.pr_number !== null && p?.pr_number !== undefined && t("harness.draftPr", { n: p.pr_number })}
            </p>
            {r.harness_stale && <p className="mt-2 text-sm text-bad">{t("harness.staleText")}</p>}
            {p ? (
              <>
                {p.blocked.map((b) => <p key={b} role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{t("harness.blocked", { reason: b })}</p>)}
                {(p.needs_human.length > 0 || confirm.length > 0) && (
                  <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                    <p className="font-medium">{t("harness.checkFirst")}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {p.needs_human.map((n) => <li key={n}>{n}</li>)}
                      {confirm.map((k) => <li key={k}>{t("harness.scannerUnsure", { field: fieldLabel(k, lang) })}</li>)}
                    </ul>
                  </div>
                )}
                {p.warnings.map((w) => <p key={w} className="mt-2 text-sm text-mute">! {w}</p>)}
                <table className="mt-4 w-full text-left text-sm">
                  <caption className="sr-only">{t("harness.caption")}</caption>
                  <thead className="text-xs text-mute"><tr><th scope="col" className="py-1.5 font-medium">{t("harness.field")}</th><th scope="col" className="py-1.5 font-medium">{t("harness.source")}</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {Object.entries(p.field_sources).sort().map(([k, s]) => (
                      <tr key={k}>
                        <td className="py-2 pr-4">{fieldLabel(k, lang)} <span className="ml-1 font-mono text-xs text-mute">{k}</span></td>
                        <td className={`py-2 ${s === "human" ? "text-warn" : "text-mute"}`}>{sourceLabel(s, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-mute hover:text-ink">{t("harness.seeYaml")}</summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-raised p-3 font-mono text-xs leading-5">{p.yaml}</pre>
                </details>
              </>
            ) : (
              <p className="mt-3 text-sm">{t("harness.noProposal")}</p>
            )}
            {c.role === "owner" ? (
              <div className="mt-5">
                <HarnessActions repoId={r.id} proposalId={p?.status === "proposed" && p.blocked.length === 0 ? p.id : null} hasProposal={p !== null} />
              </div>
            ) : (
              <p className="mt-5 text-sm text-mute">{t("harness.ownerOnly")}</p>
            )}
          </section>
        );
      })}
      <Live topic={`org:${c.org}:board`} since={new Date().toISOString()} realtime={c.realtime} />
    </Shell>
  );
}
