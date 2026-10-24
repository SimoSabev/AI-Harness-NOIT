import type { Metadata } from "next";
import Link from "next/link";
import { FileViewer } from "../../components/file-viewer";
import { Shell } from "../../components/shell";
import { Hex, StatusBadge, card, input } from "../../components/ui";
import { getT } from "../../i18n/server";
import { agentLabel } from "../../lib/agents";
import { pageName } from "../../lib/brand";
import { ago, statusOf } from "../../lib/status";
import { db } from "../../lib/server/db";
import { library } from "../../lib/server/library";
import { canAct, pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("lib.title")) };
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// The library: what the agents wrote, kept per task (the latest change of each). Left: tasks and their files (newest
// first, searchable); right: the chosen file as a document or as its change.
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await pageCtx();
  const t = await getT();
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim().toLowerCase().slice(0, 200);
  const all = canAct(c.role) ? await library(db(), c.uid, c.org) : [];
  const items = q ? all.filter((x) => x.text.toLowerCase().includes(q) || x.files.some((f) => f.path.toLowerCase().includes(q))) : all;
  const sel = items.find((x) => x.task_id === one(sp.task)) ?? items[0];
  const fileNo = Number(one(sp.file) ?? 0);
  const now = new Date();
  return (
    <Shell current="library" waiting={c.waiting} full>
      <div className="flex items-end justify-between gap-4 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("lib.title")}</h1>
          <p className="mt-1 text-sm text-mute">{t("lib.intro")}</p>
        </div>
      </div>
      {all.length === 0 ? (
        <p className={`${card} p-6 text-sm text-mute`}>{t("lib.empty")}</p>
      ) : (
        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <nav aria-label={t("lib.title")} className="flex min-h-0 flex-col gap-3">
            <form action="/library" method="get">
              <input name="q" defaultValue={q} placeholder={t("lib.search")} aria-label={t("lib.search")} className={input} />
            </form>
            <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {items.map((x) => {
                const s = statusOf(x, t.lang);
                return (
                  <li key={x.task_id} className={`rounded-lg p-2 ${sel?.task_id === x.task_id ? "bg-accent-soft" : ""}`}>
                    <Link href={`/library?task=${x.task_id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="flex items-start gap-2 text-sm">
                      <Hex tone={s.tone} className="mt-1.5 h-2 w-2.5" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2">{x.text}</span>
                        <span className="block text-[11px] text-mute">{s.label} · {ago(x.updated_at, now, t.lang)}</span>
                      </span>
                    </Link>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {x.files.map((f, i) => (
                        <li key={`${f.path}-${i}`}>
                          <Link href={`/library?task=${x.task_id}&file=${i}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                            aria-current={sel?.task_id === x.task_id && fileNo === i ? "page" : undefined}
                            className="block truncate rounded px-2 py-0.5 font-mono text-xs text-mute hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline">
                            {f.path}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex min-h-0 flex-col gap-3">
            {sel ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
                  <StatusBadge {...(() => { const s = statusOf(sel, t.lang); return { tone: s.tone, label: s.label }; })()} />
                  <span>{agentLabel(sel.agent, t.lang)}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{sel.text}</span>
                  <Link href={`/?task=${sel.task_id}`} className="underline hover:text-ink">{t("lib.openTask")}</Link>
                </div>
                {sel.files.length > 0
                  ? <FileViewer key={`${sel.task_id}-${fileNo}`} files={sel.files} start={fileNo} tall />
                  : sel.omitted_bytes !== null && <p className={`${card} p-6 text-sm text-mute`}>{t("res.tooLarge", { mb: t.num(sel.omitted_bytes / 1048576, 1) })}</p>}
              </>
            ) : <p className="text-sm text-mute">{t("lib.pick")}</p>}
          </div>
        </div>
      )}
    </Shell>
  );
}
