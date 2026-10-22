import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiffView } from "../../../components/diff-view";
import { Live } from "../../../components/live";
import { Shell } from "../../../components/shell";
import { TaskActions } from "../../../components/task-actions";
import { CheckMark, StatusBadge, card } from "../../../components/ui";
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

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await pageCtx();
  return { title: `${(await params).id} · ${pageTitle(c.waiting)}` };
}

const STEPS = ["Агентът работи", "Мандат проверява", "Решение"] as const;
const LADDER_INPUT: Record<string, string> = { success: "успех (ПРОВЕРЕНО, слято, без отмяна)", failure: "провал", hard_fail: "твърд провал", neutral: "без промяна" };
function stepOf(k: StatusKey): number {
  if (k === "queued" || k === "running") return 0;
  if (k === "checking") return 1;
  return 2;
}

// D-292: the task — what was asked, the verdict in plain words, the checks, the change, the decision.
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await pageCtx();
  const { id } = await params;
  const d = await taskDetail(db(), c.uid, c.org, c.role, id);
  if (!d) notFound();
  const t = d.task;
  const s = statusOf(t);
  const active = groupOf(s.key) === "active";
  const step = stepOf(s.key);
  const failed = d.evidence.filter((e) => e.status === "fail");
  const checks = d.evidence.filter((e) => e.status !== "n/a");
  const minutes = t.minutes > 0 ? `${t.minutes.toFixed(1)} мин` : null;
  const sess = withSample(await sessionOf(db(), c.uid, c.org, id), sessionSample(id), (x) => x.sessions.length + x.calls.length + x.lines.length === 0, await sampleOn());
  return (
    <Shell current="task" waiting={c.waiting}>
      <Link href="/" className="text-sm text-mute hover:text-ink">← Задачи</Link>

      <div className={`${card} mt-3 p-6`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
          <StatusBadge tone={s.tone} label={s.label} />
          <span>{agentLabel(t.agent)}</span>
          <span aria-hidden="true">·</span>
          <span>{ago(t.updated_at)}</span>
          {minutes && (<><span aria-hidden="true">·</span><span>{minutes}</span></>)}
          {t.usd > 0 && (<><span aria-hidden="true">·</span><span>${t.usd.toFixed(2)}</span></>)}
        </div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">{t.text}</h1>

        <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Ход на задачата">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="flex flex-col gap-1.5">
              <span className={`h-1 rounded-full ${i < step || (i === step && !active) ? (s.tone === "red" ? "bg-bad" : s.tone === "amber" ? "bg-warn" : "bg-accent") : i === step ? "animate-pulse bg-info" : "bg-line"}`} />
              <span className={`text-xs ${i <= step ? "text-ink" : "text-mute"}`}>{label}</span>
            </li>
          ))}
        </ol>

        <div className={`mt-6 rounded-lg px-4 py-3 text-sm ${s.tone === "red" ? "bg-bad-soft text-bad" : s.tone === "green" ? "bg-ok-soft text-ok" : s.tone === "amber" ? "bg-warn-soft text-warn" : "bg-raised text-ink"}`}>
          <p className="font-medium">{s.headline}</p>
          {failed.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {failed.map((e, k) => (
                <li key={k}>{e.signature ? reasonText(e.signature) : e.summary}</li>
              ))}
            </ul>
          )}
          {failed.length === 0 && t.reasons.length > 0 && s.key !== "review" && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {t.reasons.map((r) => (
                <li key={r}>{reasonText(r)}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <TaskActions taskId={t.id} status={s.key} canAct={canAct(c.role)} changesetId={t.changeset_id} headSha={t.head_sha} twoFactor={t.requires_second_factor} />
        </div>
      </div>

      <section aria-labelledby="sess-h" className="mt-8">
        <h2 id="sess-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">Сесията отвътре</h2>
        {sess.sample && <SampleNote what="агентите на тази задача, повикванията им на инструменти и отворените прозорци" table="agent_sessions, tool_calls, open_windows" />}
        <div className="mt-2 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Panel title="Агенти в сесията">{sess.data.sessions.length ? <div className="p-4"><SessionTree sessions={sess.data.sessions} /></div> : <p className="p-4 text-sm text-mute">Няма записани агенти.</p>}</Panel>
            <Panel title={`Отворени · ${sess.data.windows.length}`}><div className="p-3"><Windows windows={sess.data.windows} /></div></Panel>
          </div>
          <Panel title="Повиквания на инструменти" aside={`${sess.data.calls.length}`}>{sess.data.calls.length ? <ToolCalls calls={sess.data.calls} /> : <p className="p-4 text-sm text-mute">Още няма повиквания.</p>}</Panel>
        </div>
        <div className="mt-4">
          <Panel title="Терминал (само четене)" aside={`${sess.data.lines.length} реда`}>{sess.data.lines.length ? <Terminal lines={sess.data.lines} /> : <p className="p-4 text-sm text-mute">Агентът още не е писал.</p>}</Panel>
        </div>
      </section>

      {(t.a_total !== null || t.inv_before !== null || d.ladder || t.ledger_seq !== null) && (
        <section aria-labelledby="trust-h" className="mt-8">
          <h2 id="trust-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">Защо да вярваш на резултата</h2>
          <dl className={`${card} grid gap-px overflow-hidden bg-line sm:grid-cols-3`}>
            <div className="bg-panel p-4">
              <dt className="text-xs text-mute">Тестове преди → след</dt>
              <dd className="mt-1 font-mono text-sm">{t.a_total !== null || t.inv_before !== null ? testsOf(t) : "няма данни"}</dd>
            </div>
            <div className="bg-panel p-4">
              <dt className="text-xs text-mute">Стълба на доверие ({agentLabel(t.agent)}, {t.type})</dt>
              <dd className="mt-1 text-sm">{d.ladder ? ladderHint(d.ladder) : "ниво 0 (няма история)"}</dd>
              <dd className="mt-1 text-xs text-mute">0 клон · 1 PR чернова · 2 PR · 3 слива сам</dd>
            </div>
            <div className="bg-panel p-4">
              <dt className="text-xs text-mute">Дневник</dt>
              <dd className="mt-1 text-sm">{t.ledger_seq !== null ? `запис #${t.ledger_seq}, свързан с хеш` : "още няма запис"}</dd>
            </div>
          </dl>
          {d.ladderEvents.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-mute hover:text-ink">Как се мести стълбата ({d.ladderEvents.length})</summary>
              <ol className={`${card} mt-2 divide-y divide-line text-sm`}>
                {d.ladderEvents.map((e, k) => (
                  <li key={k} className="flex gap-4 px-4 py-2">
                    <span className="w-36 shrink-0 font-mono text-xs text-mute">{e.created_at}</span>
                    <span className="flex-1">{LADDER_INPUT[e.input] ?? e.input}</span>
                    <span className="font-mono text-xs">{e.level_before === e.level_after ? `ниво ${e.level_after}` : `ниво ${e.level_before} → ${e.level_after}`}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      {checks.length > 0 && (
        <section aria-labelledby="checks-h" className="mt-8">
          <h2 id="checks-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">Какво провери Мандат</h2>
          <ul className={`${card} divide-y divide-line`}>
            {checks.map((e, k) => (
              <li key={`${e.detector}-${k}`} className="flex items-start gap-3 px-4 py-3">
                <CheckMark status={e.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{checkLabel(e.detector)}</p>
                  {e.status !== "pass" && <p className="mt-0.5 text-sm text-mute">{e.signature ? reasonText(e.signature) : e.summary}</p>}
                </div>
                <span className="font-mono text-xs text-mute">{e.detector}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.diff && c.role !== "viewer" && (
        <section aria-labelledby="diff-h" className="mt-8">
          <h2 id="diff-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">Промяната на агента</h2>
          <DiffView files={splitDiff(d.diff)} />
        </section>
      )}

      {d.ledger.length > 0 && (
        <details className="group mt-8">
          <summary className="cursor-pointer text-sm font-medium text-mute hover:text-ink">Дневник ({d.ledger.length} записа, свързани с хеш)</summary>
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
