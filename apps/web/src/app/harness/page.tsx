import type { Metadata } from "next";
import { HarnessActions } from "../../components/harness-actions";
import { Live } from "../../components/live";
import { Shell } from "../../components/shell";
import { pageTitle } from "../../lib/inbox";
import { db } from "../../lib/server/db";
import { harnessView } from "../../lib/server/harness";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: `Харнес · ${pageTitle(c.waiting)}` };
}

const STATUS: Record<string, string> = { proposed: "чака одобрение", approved: "одобрено", draft: "чернова", accepted: "прието", rejected: "отказано" };

// т. 8.2: Свържи → предложение със source → Одобри + TOTP → PR чернова (Writer App / fakeGitHub).
export default async function HarnessPage() {
  const c = await pageCtx();
  const v = await harnessView(db(), c.uid, c.org);
  return (
    <Shell current="harness" waiting={c.waiting}>
      <h1>Харнес</h1>
      <p className="muted">Предложението идва от скенер без AI. Всяко поле показва откъде е взето. Нищо не се одобрява само.</p>
      {v.repos.map((r) => (
        <section className="card" key={r.id} aria-labelledby={`r-${r.id}`}>
          <h2 id={`r-${r.id}`}>{r.full_name}</h2>
          <p>Версия на харнеса: {r.config_version}{r.config_hash ? ` · ${r.config_hash.slice(0, 15)}…` : ""}{r.harness_stale ? " · ✖ остарял (harness_stale)" : ""}</p>
          {r.proposal ? (
            <>
              <p>Предложение: <strong>{STATUS[r.proposal.status] ?? r.proposal.status}</strong>{r.proposal.risk_cap !== null ? ` · risk_cap ${r.proposal.risk_cap}` : ""}{r.proposal.pr_number !== null ? ` · PR чернова #${r.proposal.pr_number}` : ""}</p>
              {r.proposal.blocked.map((b) => <p className="error" key={b}>✖ Блокирано: {b}</p>)}
              {r.proposal.needs_human.map((n) => <p key={n}>? Нужен е човек: {n}</p>)}
              {r.proposal.warnings.map((w) => <p className="muted" key={w}>! {w}</p>)}
              <table>
                <caption className="sr-only">Поле и източник</caption>
                <thead><tr><th scope="col">Поле</th><th scope="col">Източник</th></tr></thead>
                <tbody>
                  {Object.entries(r.proposal.field_sources).sort().map(([k, s]) => (
                    <tr key={k}><td className="mono">{k}</td><td>{s}</td></tr>
                  ))}
                </tbody>
              </table>
              <details>
                <summary className="btn">Виж .mandat.yml</summary>
                <pre className="diff mono">{r.proposal.yaml}</pre>
              </details>
            </>
          ) : (
            <p>Още няма предложение. „Свържи“ пуска скенера.</p>
          )}
          {c.role === "owner" && <HarnessActions repoId={r.id} proposalId={r.proposal?.status === "proposed" && r.proposal.blocked.length === 0 ? r.proposal.id : null} canApprove />}
        </section>
      ))}
      <Live topic={`org:${c.org}:board`} since={new Date().toISOString()} realtime={c.realtime} />
    </Shell>
  );
}
