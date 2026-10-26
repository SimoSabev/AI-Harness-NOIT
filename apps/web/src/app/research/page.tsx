import type { Metadata } from "next";
import Link from "next/link";
import { ResearchForm } from "../../components/research-form";
import { ResearchLive } from "../../components/research-live";
import { Shell } from "../../components/shell";
import { Panel } from "../../components/workbench-parts";
import { StatusBadge, btn } from "../../components/ui";
import { getT } from "../../i18n/server";
import { pageName } from "../../lib/brand";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { researchChannels, researchFeed, researchQuestions } from "../../lib/server/research";
import type { ResearchQuestionRow } from "../../lib/server/research";
import type { Tone } from "../../lib/status";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("research.title")) };
}

const TONE: Record<ResearchQuestionRow["status"], Tone> = { queued: "gray", running: "blue", done: "green", partial: "amber", failed: "red", stopped: "gray" };

// E9d (D-409): the research page — the questions on the left; a new question, or one question live: its result in the
// middle and its activity on the right (research-live.tsx).
export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ q?: string; new?: string }> }) {
  const c = await pageCtx();
  const t = await getT();
  const sp = await searchParams;
  const [questions, channels] = await Promise.all([researchQuestions(db(), c.uid, c.org), researchChannels(db(), c.uid, c.org)]);
  const showForm = sp.new === "1" || questions.length === 0;
  const pick = showForm ? null : (questions.find((q) => q.id === sp.q) ?? questions[0] ?? null);
  const feed = pick ? await researchFeed(db(), c.uid, c.org, pick.id, -1) : null;
  return (
    <Shell current="research" waiting={c.waiting} wide>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("research.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-mute">{t("research.intro")}</p>
        </div>
        {!showForm && <Link href="/research?new=1" className={btn.primary}>{t("research.new")}</Link>}
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Panel title={t("research.questions", { n: questions.length })} className="self-start">
          {questions.length === 0 ? (
            <p className="p-4 text-sm text-mute">{t("research.none")}</p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto p-2">
              {questions.map((q) => (
                <li key={q.id}>
                  <Link href={`/research?q=${q.id}`} aria-current={pick?.id === q.id ? "page" : undefined} className="block rounded-lg px-3 py-2 text-sm hover:bg-raised aria-[current=page]:bg-accent-soft">
                    <span className="line-clamp-2">{q.question}</span>
                    <span className="mt-1 flex items-center gap-2"><StatusBadge tone={TONE[q.status]} label={t(`research.st.${q.status}`)} />{q.depth && <span className="text-xs text-mute">{t(`research.depth.${q.depth}`)}</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {feed ? <ResearchLive key={feed.question.id} initial={feed} /> : <ResearchForm channels={channels} />}
      </div>
    </Shell>
  );
}
