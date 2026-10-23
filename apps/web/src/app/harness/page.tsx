import type { Metadata } from "next";
import { HarnessActions } from "../../components/harness-actions";
import { ProfileActions } from "../../components/profile-actions";
import { HiddenTestsPanel } from "../../components/hidden-tests-panel";
import { hiddenSets } from "../../lib/server/hidden";
import { Live } from "../../components/live";
import { Shell } from "../../components/shell";
import { StatusBadge, card } from "../../components/ui";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import { fieldLabel, humanFields, proposalStatus, sourceLabel } from "../../lib/harness-view";
import { pageTitle } from "../../lib/inbox";
import { db } from "../../lib/server/db";
import { harnessView } from "../../lib/server/harness";
import { profileView } from "../../lib/server/profile";
import type { ProfileView } from "../../lib/server/profile";
import type { Key, T } from "../../i18n/t";
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
  const profiles = new Map<string, ProfileView>();
  for (const r of v.repos) profiles.set(r.id, await profileView(db(), c.uid, c.org, r.id));
  const hidden = new Map<string, Awaited<ReturnType<typeof hiddenSets>>>();
  for (const r of v.repos) hidden.set(r.id, await hiddenSets(db(), c.uid, r.id));
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
            <ProfilePanel t={t} repoId={r.id} view={profiles.get(r.id)} canApprove={c.role === "owner"} />
            <HiddenTestsPanel repoId={r.id} sets={hidden.get(r.id) ?? []} canUpload={c.role === "owner"} />
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

const LAYERS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
// E8b (v5 p. 4.2 (4)): the profile by layer, every value with its source; the compiled preview per agent; approve/rollback.
function ProfilePanel({ t, repoId, view, canApprove }: { t: T; repoId: string; view: ProfileView | undefined; canApprove: boolean }) {
  const top = view?.versions[0];
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="font-display text-base font-semibold">{t("profile.title")}</h3>
      <p className="mt-1 text-sm text-mute">{t("profile.intro")}</p>
      {!view || !top ? (
        <p className="mt-3 text-sm">{t("profile.none")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            {t("profile.version", { v: top.version })} · {t(`profile.status.${top.status}` as Key)} <span className="font-mono text-xs text-mute">{top.profile_hash.slice(7, 19)}</span>
          </p>
          <div className="mt-3 space-y-2">
            {LAYERS.map((k) => (
              <details key={k} className="rounded-lg border border-line px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">{t(`profile.layer.${k}` as Key)}</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-raised p-3 font-mono text-xs leading-5">{JSON.stringify(top.layers[k], null, 2)}</pre>
                <p className="mt-2 text-xs text-mute">{t("profile.sources")}: {Object.entries(top.sources).filter(([f]) => f === k || f.startsWith(`${k}.`)).map(([f, s]) => `${f} ← ${s}`).join(" · ") || "—"}</p>
              </details>
            ))}
          </div>
          <details className="mt-3 rounded-lg border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">{t("profile.preview")}</summary>
            {(["claude", "codex"] as const).map((a) => (
              <div key={a} className="mt-3">
                <p className="text-sm font-medium">{a === "claude" ? t("profile.previewClaude") : t("profile.previewCodex")}</p>
                <ul className="mt-1 space-y-1">
                  {view.preview[a].map((f) => (
                    <li key={f.path}>
                      <details>
                        <summary className="cursor-pointer font-mono text-xs">/m/in/harness/{f.path}</summary>
                        <pre className="mt-1 max-h-64 overflow-auto rounded bg-raised p-2 font-mono text-[11px] leading-4">{f.bytes}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-3 text-sm font-medium">{t("profile.enforced")}</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-mute">{view.preview.enforced.map((e) => <li key={e.rule}><span className="font-mono">{e.rule}</span> — {e.why}</li>)}</ul>
            {view.preview.unsupported.length > 0 && (
              <>
                <p className="mt-3 text-sm font-medium">{t("profile.unsupported")}</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-mute">{view.preview.unsupported.map((e) => <li key={e.rule}><span className="font-mono">{e.rule}</span> — {e.why}</li>)}</ul>
              </>
            )}
          </details>
          <p className="mt-3 text-sm text-mute">{t("profile.history")}: {view.versions.map((x) => `${x.version} (${t(`profile.status.${x.status}` as Key)})`).join(", ")}</p>
          {canApprove ? (
            <ProfileActions repoId={repoId} proposedId={top.status === "proposed" ? top.id : null} versions={view.versions.filter((x) => x.status !== "proposed").map((x) => x.version)} />
          ) : (
            <p className="mt-3 text-sm text-mute">{t("profile.ownerOnly")}</p>
          )}
        </>
      )}
    </div>
  );
}
