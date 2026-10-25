import { getT } from "../i18n/server";
import type { Key } from "../i18n/t";
import { agentLabel } from "../lib/agents";
import { ladderHint } from "../lib/ladder-hint";
import { checkLabel } from "../lib/status";
import { reasonText, testsOf } from "../lib/verdict-view";
import { uiShotsView } from "../lib/ui-shots";
import type { TaskDetail } from "../lib/server/queries";
import type { sessionOf } from "../lib/server/workbench";
import { CheckMark, card } from "./ui";
import { Panel, SessionTree, Terminal, ToolCalls } from "./workbench-parts";

// D-386: the parts of a task that explain the result but are not needed to decide — rendered on the server and shown
// by the one task view (live-task.tsx): the before/after screenshots next to the change, the rest under "Details".
const LADDER_INPUT: Record<string, Key> = { success: "ladder.input.success", failure: "ladder.input.failure", hard_fail: "ladder.input.hard_fail", neutral: "ladder.input.neutral" };

/** E9b (D12): before/after per route — the screenshots are approver+ (the names come back only for them). */
export async function TaskShots({ d }: { d: TaskDetail }) {
  const tr = await getT();
  const ui = uiShotsView(d.task.changeset_id, d.evidence, d.shots);
  if (ui.length === 0) return null;
  return (
    <section aria-label={tr("task.ui.title")} className="space-y-3">
      <p className="text-xs font-medium text-mute">{tr("task.ui.title")}</p>
      {ui.map((r) => (
        <div key={r.route} className={`${card} p-4`}>
          <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="font-mono">{r.route}</span>
            {r.diff !== null && <span className="text-xs text-mute">{tr("task.ui.diff", { pct: tr.num(r.diff * 100, 1) })}</span>}
          </p>
          {r.errors.length > 0 && <ul className="mt-2 list-disc pl-5 font-mono text-xs text-bad">{r.errors.map((x, k) => <li key={k}>{x}</li>)}</ul>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([["before", r.before], ["after", r.after]] as const).map(([k, src]) => (
              <figure key={k} className="min-w-0">
                {src ? <img src={src} alt={tr(k === "before" ? "task.ui.beforeAlt" : "task.ui.afterAlt", { route: r.route })} loading="lazy" className="w-full rounded-lg border border-line" /> : <p className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-mute">{tr("task.ui.none")}</p>}
                <figcaption className="mt-1 text-xs text-mute">{tr(k === "before" ? "task.ui.before" : "task.ui.after")}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Every check, the trust, the session inside (only what was recorded) and the log entries. */
export async function TaskDetails({ d, sess }: { d: TaskDetail; sess: Awaited<ReturnType<typeof sessionOf>> }) {
  const tr = await getT();
  const t = d.task;
  const checks = d.evidence.filter((e) => e.status !== "n/a");
  return (
    <div className="space-y-6">
      {checks.length > 0 && (
        <section aria-labelledby="checks-h">
          <h3 id="checks-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.checked")}</h3>
          <ul className={`${card} divide-y divide-line`}>
            {checks.map((e, k) => (
              <li key={`${e.detector}-${k}`} className="flex items-start gap-3 px-4 py-3">
                <CheckMark status={e.status} t={tr} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{checkLabel(e.detector, tr.lang)}</p>
                  {e.status !== "pass" && <p className="mt-0.5 text-sm text-mute">{e.signature ? reasonText(e.signature, tr.lang) : e.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(t.a_total !== null || t.inv_before !== null || d.ladder || t.ledger_seq !== null) && (
        <section aria-labelledby="trust-h">
          <h3 id="trust-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.trust")}</h3>
          <dl className={`${card} grid gap-px overflow-hidden bg-line sm:grid-cols-3`}>
            <div className="bg-panel p-4">
              <dt className="text-xs text-mute">{tr("task.testsBeforeAfter")}</dt>
              <dd className="mt-1 font-mono text-sm">{t.a_total !== null || t.inv_before !== null ? testsOf(t, tr.lang) : tr("task.noData")}</dd>
            </div>
            <div className="bg-panel p-4">
              <dt className="text-xs text-mute">{tr("task.ladder", { agent: agentLabel(t.agent, tr.lang), type: t.type })}</dt>
              <dd className="mt-1 text-sm">{d.ladder ? ladderHint(d.ladder, tr.lang) : tr("task.ladderNone")}</dd>
              <dd className="mt-1 text-xs text-mute">{tr("task.ladderLegend")}</dd>
            </div>
            <div className="bg-panel p-4">
              <dt className="text-xs text-mute">{tr("task.ledger")}</dt>
              <dd className="mt-1 text-sm">{t.ledger_seq !== null ? tr("task.ledgerEntry", { n: t.ledger_seq }) : tr("task.ledgerNone")}</dd>
            </div>
          </dl>
          {d.ladderEvents.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-mute hover:text-ink">{tr("task.ladderMoves", { n: d.ladderEvents.length })}</summary>
              <ol className={`${card} mt-2 divide-y divide-line text-sm`}>
                {d.ladderEvents.map((e, k) => (
                  <li key={k} className="flex gap-4 px-4 py-2">
                    <span className="w-36 shrink-0 font-mono text-xs text-mute">{e.created_at}</span>
                    <span className="flex-1">{LADDER_INPUT[e.input] ? tr(LADDER_INPUT[e.input] as Key) : e.input}</span>
                    <span className="font-mono text-xs">{e.level_before === e.level_after ? tr("task.level", { n: e.level_after }) : tr("task.levelMove", { from: e.level_before, to: e.level_after })}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      {sess.sessions.length + sess.calls.length + sess.lines.length > 0 && (
        <section aria-labelledby="sess-h">
          <h3 id="sess-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.session")}</h3>
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Panel title={tr("task.sessionAgents")}>{sess.sessions.length ? <div className="p-4"><SessionTree sessions={sess.sessions} t={tr} /></div> : <p className="p-4 text-sm text-mute">{tr("task.noAgents")}</p>}</Panel>
            <Panel title={tr("task.toolCalls")} aside={`${sess.calls.length}`}>{sess.calls.length ? <ToolCalls calls={sess.calls} t={tr} /> : <p className="p-4 text-sm text-mute">{tr("task.noCalls")}</p>}</Panel>
          </div>
          <div className="mt-4">
            <Panel title={tr("task.terminal")} aside={tr("task.lines", { n: tr.num(sess.lines.length) })}>{sess.lines.length ? <Terminal lines={sess.lines} t={tr} /> : <p className="p-4 text-sm text-mute">{tr("task.noLines")}</p>}</Panel>
          </div>
        </section>
      )}

      {d.ledger.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-mute hover:text-ink">{tr("task.ledgerAll", { n: d.ledger.length })}</summary>
          <ol className={`${card} mt-2 divide-y divide-line font-mono text-xs`}>
            {d.ledger.map((r) => (
              <li key={r.seq} className="flex gap-4 px-4 py-2">
                <span className="w-8 text-mute">#{r.seq}</span>
                <span className="flex-1">{r.kind}</span>
                <span className="text-mute">{r.hash.slice(0, 16)}…</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
