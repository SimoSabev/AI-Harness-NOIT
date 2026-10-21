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
  return (
    <Shell current="task" waiting={c.waiting}>
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">← Задачи</Link>

      <div className={`${card} mt-3 p-6`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
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
              <span className={`h-1 rounded-full ${i < step || (i === step && !active) ? (s.tone === "red" ? "bg-red-500" : s.tone === "amber" ? "bg-amber-500" : "bg-zinc-900 dark:bg-white") : i === step ? "animate-pulse bg-sky-500" : "bg-zinc-200 dark:bg-zinc-800"}`} />
              <span className={`text-xs ${i <= step ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}>{label}</span>
            </li>
          ))}
        </ol>

        <div className={`mt-6 rounded-lg px-4 py-3 text-sm ${s.tone === "red" ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200" : s.tone === "green" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : s.tone === "amber" ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
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

      {(t.a_total !== null || t.inv_before !== null || d.ladder || t.ledger_seq !== null) && (
        <section aria-labelledby="trust-h" className="mt-8">
          <h2 id="trust-h" className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Защо да вярваш на резултата</h2>
          <dl className={`${card} grid gap-px overflow-hidden bg-zinc-200 sm:grid-cols-3 dark:bg-zinc-800`}>
            <div className="bg-white p-4 dark:bg-zinc-900">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Тестове преди → след</dt>
              <dd className="mt-1 font-mono text-sm">{t.a_total !== null || t.inv_before !== null ? testsOf(t) : "няма данни"}</dd>
            </div>
            <div className="bg-white p-4 dark:bg-zinc-900">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Стълба на доверие ({agentLabel(t.agent)}, {t.type})</dt>
              <dd className="mt-1 text-sm">{d.ladder ? ladderHint(d.ladder) : "ниво 0 (няма история)"}</dd>
              <dd className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">0 клон · 1 PR чернова · 2 PR · 3 слива сам</dd>
            </div>
            <div className="bg-white p-4 dark:bg-zinc-900">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Дневник</dt>
              <dd className="mt-1 text-sm">{t.ledger_seq !== null ? `запис #${t.ledger_seq}, свързан с хеш` : "още няма запис"}</dd>
            </div>
          </dl>
          {d.ladderEvents.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Как се мести стълбата ({d.ladderEvents.length})</summary>
              <ol className={`${card} mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800`}>
                {d.ladderEvents.map((e, k) => (
                  <li key={k} className="flex gap-4 px-4 py-2">
                    <span className="w-36 shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">{e.created_at}</span>
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
          <h2 id="checks-h" className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Какво провери Мандат</h2>
          <ul className={`${card} divide-y divide-zinc-200 dark:divide-zinc-800`}>
            {checks.map((e, k) => (
              <li key={`${e.detector}-${k}`} className="flex items-start gap-3 px-4 py-3">
                <CheckMark status={e.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{checkLabel(e.detector)}</p>
                  {e.status !== "pass" && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{e.signature ? reasonText(e.signature) : e.summary}</p>}
                </div>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{e.detector}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.diff && c.role !== "viewer" && (
        <section aria-labelledby="diff-h" className="mt-8">
          <h2 id="diff-h" className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Промяната на агента</h2>
          <DiffView files={splitDiff(d.diff)} />
        </section>
      )}

      {d.ledger.length > 0 && (
        <details className="group mt-8">
          <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Дневник ({d.ledger.length} записа, свързани с хеш)</summary>
          <ol className={`${card} mt-2 divide-y divide-zinc-200 font-mono text-xs dark:divide-zinc-800`}>
            {d.ledger.map((r) => (
              <li key={r.seq} className="flex gap-4 px-4 py-2">
                <span className="w-8 text-zinc-500 dark:text-zinc-400">#{r.seq}</span>
                <span className="flex-1">{r.kind}</span>
                <span className="text-zinc-500 dark:text-zinc-400">{r.hash.slice(0, 16)}…</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <Live topic={`task:${t.id}`} since={new Date().toISOString()} realtime={c.realtime} fast={active} />
    </Shell>
  );
}
