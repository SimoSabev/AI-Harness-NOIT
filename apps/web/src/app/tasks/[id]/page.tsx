import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiffView } from "../../../components/diff-view";
import { Live } from "../../../components/live";
import { Shell } from "../../../components/shell";
import { TaskActions } from "../../../components/task-actions";
import { AskCards } from "../../../components/ask-cards";
import { SteerBox } from "../../../components/steer-box";
import { CheckMark, StatusBadge, card } from "../../../components/ui";
import { getT } from "../../../i18n/server";
import type { Key } from "../../../i18n/t";
import { agentLabel } from "../../../lib/agents";
import { pageTitle } from "../../../lib/inbox";
import { ago, checkLabel, groupOf, statusOf } from "../../../lib/status";
import type { StatusKey } from "../../../lib/status";
import { splitDiff } from "../../../lib/diff-view";
import { ladderHint } from "../../../lib/ladder-hint";
import { reasonText, testsOf } from "../../../lib/verdict-view";
import { db } from "../../../lib/server/db";
import { canAct, pageCtx } from "../../../lib/server/page";
import { taskDetail } from "../../../lib/server/queries";
import { sampleOn } from "../../../lib/server/sample-pref";
import { sessionOf } from "../../../lib/server/workbench";
import { sessionSample } from "../../../lib/sample";
import { withSample } from "../../../lib/workbench";
import { Panel, SampleNote, SessionTree, Terminal, ToolCalls, Windows } from "../../../components/workbench-parts";
import { uiShotsView } from "../../../lib/ui-shots";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [c, t] = await Promise.all([pageCtx(), getT()]);
  return { title: `${(await params).id} · ${pageTitle(c.waiting, t.lang)}` };
}

const STEPS: readonly Key[] = ["task.step.agent", "task.step.check", "task.step.decision"];
const LADDER_INPUT: Record<string, Key> = { success: "ladder.input.success", failure: "ladder.input.failure", hard_fail: "ladder.input.hard_fail", neutral: "ladder.input.neutral" };
function stepOf(k: StatusKey): number {
  if (k === "queued" || k === "running") return 0;
  if (k === "checking") return 1;
  return 2;
}

// D-292: the task — what was asked, the verdict in plain words, the checks, the change, the decision.
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await pageCtx();
  const tr = await getT();
  const { id } = await params;
  const d = await taskDetail(db(), c.uid, c.org, c.role, id);
  if (!d) notFound();
  const t = d.task;
  const s = statusOf(t, tr.lang);
  const active = groupOf(s.key) === "active";
  const step = stepOf(s.key);
  const failed = d.evidence.filter((e) => e.status === "fail");
  const checks = d.evidence.filter((e) => e.status !== "n/a");
  // E9b (D12): before/after per route — the screenshots are approver+ (the names come back only for them)
  const ui = uiShotsView(t.changeset_id, d.evidence, d.shots);
  const minutes = t.minutes > 0 ? tr("task.minutes", { n: tr.num(t.minutes, 1) }) : null;
  const sess = withSample(await sessionOf(db(), c.uid, c.org, id), sessionSample(id), (x) => x.sessions.length + x.calls.length + x.lines.length === 0, await sampleOn());
  return (
    <Shell current="task" waiting={c.waiting}>
      <Link href="/" className="text-sm text-mute hover:text-ink">{tr("task.back")}</Link>

      <div className={`${card} mt-3 p-6`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
          <StatusBadge tone={s.tone} label={s.label} />
          <span>{agentLabel(t.agent, tr.lang)}</span>
          <span aria-hidden="true">·</span>
          <span>{ago(t.updated_at, new Date(), tr.lang)}</span>
          {minutes && (<><span aria-hidden="true">·</span><span>{minutes}</span></>)}
          {t.usd > 0 && (<><span aria-hidden="true">·</span><span>{tr.usd(t.usd)}</span></>)}
        </div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">{t.text}</h1>

        <ol className="mt-6 grid grid-cols-3 gap-2" aria-label={tr("task.progress")}>
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="flex flex-col gap-1.5">
              <span className={`h-1 rounded-full ${i < step || (i === step && !active) ? (s.tone === "red" ? "bg-bad" : s.tone === "amber" ? "bg-warn" : "bg-accent") : i === step ? "animate-pulse bg-info" : "bg-line"}`} />
              <span className={`text-xs ${i <= step ? "text-ink" : "text-mute"}`}>{tr(label)}</span>
            </li>
          ))}
        </ol>

        <div className={`mt-6 rounded-lg px-4 py-3 text-sm ${s.tone === "red" ? "bg-bad-soft text-bad" : s.tone === "green" ? "bg-ok-soft text-ok" : s.tone === "amber" ? "bg-warn-soft text-warn" : "bg-raised text-ink"}`}>
          <p className="font-medium">{s.headline}</p>
          {failed.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {failed.map((e, k) => (
                <li key={k}>{e.signature ? reasonText(e.signature, tr.lang) : e.summary}</li>
              ))}
            </ul>
          )}
          {failed.length === 0 && t.reasons.length > 0 && s.key !== "review" && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {t.reasons.map((r) => (
                <li key={r}>{reasonText(r, tr.lang)}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <TaskActions taskId={t.id} status={s.key} canAct={canAct(c.role)} changesetId={t.changeset_id} headSha={t.head_sha} twoFactor={t.requires_second_factor} />
        </div>
        {(s.key === "running" || s.key === "queued") && canAct(c.role) && <SteerBox taskId={t.id} live={t.steerable === true} codex={t.agent === "codex" || t.agent.startsWith("fake-codex:")} />}
        {d.asks.length > 0 && <AskCards taskId={t.id} asks={d.asks} attempt={d.asks[0]?.attempt ?? 1} canDecide={canAct(c.role) && s.key === "ask"} />}
      </div>

      <section aria-labelledby="sess-h" className="mt-8">
        <h2 id="sess-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.session")}</h2>
        {sess.sample && <SampleNote what={tr("task.sessionSample")} table="agent_sessions, tool_calls, open_windows" t={tr} />}
        <div className="mt-2 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Panel title={tr("task.sessionAgents")}>{sess.data.sessions.length ? <div className="p-4"><SessionTree sessions={sess.data.sessions} t={tr} /></div> : <p className="p-4 text-sm text-mute">{tr("task.noAgents")}</p>}</Panel>
            <Panel title={tr("home.open", { n: sess.data.windows.length })}><div className="p-3"><Windows windows={sess.data.windows} t={tr} /></div></Panel>
          </div>
          <Panel title={tr("task.toolCalls")} aside={`${sess.data.calls.length}`}>{sess.data.calls.length ? <ToolCalls calls={sess.data.calls} t={tr} /> : <p className="p-4 text-sm text-mute">{tr("task.noCalls")}</p>}</Panel>
        </div>
        <div className="mt-4">
          <Panel title={tr("task.terminal")} aside={tr("task.lines", { n: tr.num(sess.data.lines.length) })}>{sess.data.lines.length ? <Terminal lines={sess.data.lines} t={tr} /> : <p className="p-4 text-sm text-mute">{tr("task.noLines")}</p>}</Panel>
        </div>
      </section>

      {(t.a_total !== null || t.inv_before !== null || d.ladder || t.ledger_seq !== null) && (
        <section aria-labelledby="trust-h" className="mt-8">
          <h2 id="trust-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.trust")}</h2>
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

      {checks.length > 0 && (
        <section aria-labelledby="checks-h" className="mt-8">
          <h2 id="checks-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.checked")}</h2>
          <ul className={`${card} divide-y divide-line`}>
            {checks.map((e, k) => (
              <li key={`${e.detector}-${k}`} className="flex items-start gap-3 px-4 py-3">
                <CheckMark status={e.status} t={tr} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{checkLabel(e.detector, tr.lang)}</p>
                  {e.status !== "pass" && <p className="mt-0.5 text-sm text-mute">{e.signature ? reasonText(e.signature, tr.lang) : e.summary}</p>}
                </div>
                <span className="font-mono text-xs text-mute">{e.detector}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ui.length > 0 && (
        <section aria-labelledby="ui-h" className="mt-8">
          <h2 id="ui-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.ui.title")}</h2>
          <ul className="space-y-4">
            {ui.map((r) => (
              <li key={r.route} className={`${card} p-4`}>
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
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.diff && c.role !== "viewer" && (
        <section aria-labelledby="diff-h" className="mt-8">
          <h2 id="diff-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{tr("task.change")}</h2>
          <DiffView files={splitDiff(d.diff)} t={tr} />
        </section>
      )}

      {d.ledger.length > 0 && (
        <details className="group mt-8">
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

      <Live topic={`task:${t.id}`} since={new Date().toISOString()} realtime={c.realtime} fast={active} />
    </Shell>
  );
}
