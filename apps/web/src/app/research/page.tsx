import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "../../components/shell";
import { Panel, SampleNote } from "../../components/workbench-parts";
import { card } from "../../components/ui";
import { pageName } from "../../lib/brand";
import { SAMPLE } from "../../lib/sample";
import { withSample } from "../../lib/workbench";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { sampleOn } from "../../lib/server/sample-pref";
import { researchView } from "../../lib/server/workbench";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Ресърч") };

const V = { confirmed: { t: "потвърдено", c: "text-ok", m: "bg-ok" }, single: { t: "един източник", c: "text-warn", m: "bg-warn" }, conflict: { t: "противоречие", c: "text-bad", m: "bg-bad" }, unchecked: { t: "непроверено", c: "text-mute", m: "bg-idle" } } as const;
const S = { read: { t: "прочетен", c: "text-ok" }, weak: { t: "слаб", c: "text-warn" }, failed: { t: "не отваря", c: "text-bad" } } as const;

// D-307 / design H6: a question, the agents on it, every claim checked against its sources by Mandat, the draft answer.
export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const c = await pageCtx();
  const qid = (await searchParams).q;
  const src = withSample(await researchView(db(), c.uid, c.org, qid), SAMPLE.research, (x) => x.questions.length === 0, await sampleOn());
  const r = src.data;
  const cur = r.current;
  const count = (v: keyof typeof V) => cur?.claims.filter((x) => x.verdict === v).length ?? 0;
  return (
    <Shell current="research" waiting={c.waiting} wide>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Ресърч</h1>
      <p className="mt-1 text-sm text-mute">Агентите търсят и четат; Мандат отваря всеки източник и търси цитата, преди твърдението да влезе в отговора.</p>
      {src.sample && <SampleNote what="въпросите за ресърч, прочетените източници и проверените твърдения" table="research_questions, research_sources, research_claims" />}
      {r.questions.length === 0 ? (
        <p className={`${card} mt-6 p-6 text-sm text-mute`}>Още няма въпроси за ресърч.</p>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <Panel title={`Въпроси · ${r.questions.length}`}>
            <ul className="p-2">
              {r.questions.map((q) => (
                <li key={q.id}><Link href={`/research?q=${q.id}`} aria-current={cur?.id === q.id ? "page" : undefined} className="block rounded-lg px-3 py-2 text-sm hover:bg-raised aria-[current=page]:bg-accent-soft"><span className="line-clamp-2">{q.question}</span><span className="mt-0.5 block text-xs text-mute">{q.status === "running" ? "върви" : q.status === "done" ? "готов" : "провал"} · {q.claims} твърдения</span></Link></li>
              ))}
            </ul>
          </Panel>
          {cur && (
            <>
              <div className="flex min-w-0 flex-col gap-4">
                <section className={`${card} rise p-5`}>
                  <p className="font-mono text-[11px] tracking-[0.1em] text-accent-text">ВЪПРОС · {cur.status === "running" ? "ВЪРВИ" : "ГОТОВ"}</p>
                  <h2 className="mt-1 font-display text-xl font-semibold leading-snug">{cur.question}</h2>
                </section>
                <Panel title="Твърдения" aside={<span className="flex gap-3"><span className="text-ok">{count("confirmed")} потвърдени</span><span className="text-warn">{count("single")} с един източник</span><span className="text-bad">{count("conflict")} противоречия</span></span>}>
                  <ul className="divide-y divide-line">
                    {cur.claims.map((x, i) => (
                      <li key={i} className="grid grid-cols-[18px_minmax(0,1fr)_120px] gap-3 px-4 py-3">
                        <span aria-hidden="true" className={`hex mt-1 inline-block h-3 w-3.5 ${V[x.verdict].m}`} />
                        <span><span className="block text-sm leading-relaxed">{x.text}</span><span className="mt-1 flex flex-wrap gap-1">{x.source_ns.map((n) => <a key={n} href={cur.sources.find((s) => s.n === n)?.url ?? "#"} className="rounded border border-line px-1.5 font-mono text-[10px] text-mute no-underline hover:text-ink" target="_blank" rel="noreferrer">[{n}]</a>)}</span></span>
                        <span className={`text-right text-xs ${V[x.verdict].c}`}>{V[x.verdict].t}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
              <div className="flex flex-col gap-4">
                <Panel title={`Източници · ${cur.sources.length}`} aside={`прочетени ${cur.sources.filter((s) => s.state === "read").length}`}>
                  <ul className="divide-y divide-line">{cur.sources.map((s) => <li key={s.n} className="grid grid-cols-[34px_minmax(0,1fr)_70px] gap-2 px-4 py-2 text-xs"><span className="font-mono text-mute">[{s.n}]</span><a href={s.url} target="_blank" rel="noreferrer" className="truncate text-ink no-underline hover:underline">{s.title}</a><span className={`text-right ${S[s.state].c}`}>{S[s.state].t}</span></li>)}</ul>
                </Panel>
                <Panel title="Чернова на отговора">
                  <p className="p-4 text-sm leading-relaxed text-mute">{cur.draft ?? "Черновата се пише, докато твърденията се проверяват."}</p>
                </Panel>
              </div>
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
