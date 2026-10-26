"use client";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ClaimVerdict, ResearchReport, TraceEvent } from "@mandat/contract";
import { duration, usdText } from "@mandat/research/report";
import { useT } from "../i18n/client";
import type { T } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { PHASES, hostOf, liveState } from "../lib/research-view";
import type { LiveState } from "../lib/research-view";
import type { ResearchFeed, ResearchQuestionRow } from "../lib/research-types";
import type { Tone } from "../lib/status";
import { StatusBadge, btn, card, label } from "./ui";

// E9d (D-409): one research question, live. The centre is the result (the plan and what is found while it runs, the
// answer with citations, claims, sources when it ends); the right-hand panel is the activity: the phase, every lane and
// what it does now, the models with their calls and cost, and every step as it happens (SSE /api/research/:id/stream).

const STATUS_TONE: Record<ResearchQuestionRow["status"], Tone> = { queued: "gray", running: "blue", done: "green", partial: "amber", failed: "red", stopped: "gray" };
const VERDICT_TONE: Record<ClaimVerdict, Tone> = { confirmed: "green", single: "amber", conflict: "red", unchecked: "gray", quote_missing: "gray" };
const LANE_COLORS = ["text-info", "text-accent-text", "text-ok", "text-warn", "text-bad", "text-ink", "text-mute", "text-info"];
const laneColor = (lane: string | null) => (lane && /^l\d+$/.test(lane) ? (LANE_COLORS[(Number(lane.slice(1)) - 1) % LANE_COLORS.length] ?? "text-mute") : "text-mute");
const ICON: Record<TraceEvent["kind"], string> = { run_started: "▶", plan: "◆", model_call: "◇", query: "⌕", results: "≡", fetch: "↓", read: "✎", reflect: "↻", claim: "✓", section: "¶", budget: "$", note: "!", run_finished: "■" };

function useResearchFeed(initial: ResearchFeed): ResearchFeed {
  const [feed, setFeed] = useState<ResearchFeed>(initial);
  const id = initial.question.id;
  useEffect(() => {
    setFeed(initial);
    if (initial.report || ["failed", "stopped"].includes(initial.question.status)) return;
    const es = new EventSource(`/api/research/${id}/stream?after=${initial.events.at(-1)?.seq ?? -1}`);
    es.addEventListener("feed", (e) => {
      const f = JSON.parse((e as MessageEvent<string>).data) as ResearchFeed;
      setFeed((cur) => {
        const seen = new Set(cur.events.map((x) => x.seq));
        return { question: f.question, events: [...cur.events, ...f.events.filter((x) => !seen.has(x.seq))], report: f.report ?? cur.report };
      });
      if (f.report || ["failed", "stopped"].includes(f.question.status)) es.close();
    });
    return () => es.close();
    // one stream per question; the page remounts this component per question
  }, [id]);
  return feed;
}

function evText(e: TraceEvent, t: T): string {
  switch (e.kind) {
    case "run_started": return t("research.ev.run_started", { depth: t(`research.depth.${e.depth}`), goal: t(`research.goal.${e.goal}`) });
    case "plan": return t("research.ev.plan", { strategy: e.strategy });
    case "model_call": return `${t("research.ev.model", { role: t(`research.role.${e.role}`), model: e.model })} · ${e.purpose} · ${(e.input_tokens + e.output_tokens).toLocaleString()} · ${usdText(e.usd)}${e.ok ? "" : " ✕"}`;
    case "query": return t("research.ev.query", { provider: e.provider, query: e.query });
    case "results": return t("research.ev.results", { provider: e.provider, hits: e.hits, fresh: e.new_hits });
    case "fetch": return t("research.ev.fetch", { tier: t(`research.tier.${e.tier}`), status: e.status, domain: e.domain });
    case "read": return e.rejected > 0 ? t("research.ev.readRejected", { domain: hostOf(e.url), quotes: e.quotes, rejected: e.rejected }) : t("research.ev.read", { domain: hostOf(e.url), quotes: e.quotes });
    case "reflect": return e.done ? t("research.ev.reflectDone", { reason: e.reason }) : t("research.ev.reflectMore", { gaps: e.gaps.join("; ") || e.reason });
    case "claim": return t("research.ev.claim", { verdict: t(`research.v.${e.verdict}`), text: e.text });
    case "section": return t("research.ev.section", { title: e.title });
    case "budget": return t("research.ev.budget", { spent: usdText(e.spent_usd), pages: e.pages });
    case "note": return e.text;
    case "run_finished": return t("research.ev.run_finished", { status: t(`research.st.${e.status}`) });
  }
}
const tone = (e: TraceEvent): string =>
  (e.kind === "fetch" && (e.status === "blocked" || e.status === "failed")) || (e.kind === "model_call" && !e.ok) || (e.kind === "note" && e.level === "warn")
    ? "text-bad"
    : e.kind === "fetch" && e.status !== "ok"
      ? "text-warn"
      : e.kind === "claim" || e.kind === "run_finished"
        ? "text-ink"
        : "text-mute";

function Elapsed({ from, to }: { from: string | null; to: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (to || !from) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [from, to]);
  if (!from) return null;
  return <>{duration(Math.max(0, (to ? Date.parse(to) : now) - Date.parse(from)))}</>;
}

/** text with [n] citations as chips that show the exact quote on hover; paragraphs, "- " lists and "#" headings */
function Cited({ text, report }: { text: string; report: ResearchReport | null }) {
  const cite = (n: number) => {
    const s = report?.sources.find((x) => x.n === n);
    if (!s) return null;
    const q = report?.quotes.find((x) => x.source_id === s.id);
    return (
      <a key={`c${n}`} href={s.final_url} target="_blank" rel="noreferrer noopener" title={`${q ? `“${q.text}” — ` : ""}${s.domain}${s.published ? `, ${s.published}` : ""}`} className="ml-0.5 inline-block rounded border border-line px-1 align-super font-mono text-[10px] text-accent-text no-underline hover:bg-accent-soft">
        {n}
      </a>
    );
  };
  const inline = (line: string) =>
    line.split(/(\[\d{1,3}(?:\s*,\s*\d{1,3})*\])/).map((part, i) => {
      const m = /^\[(.+)\]$/.exec(part);
      if (!m) return <Fragment key={i}>{part.replace(/\*\*/g, "")}</Fragment>;
      return <Fragment key={i}>{(m[1] ?? "").split(",").map((x) => cite(Number(x.trim())))}</Fragment>;
    });
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim() !== "");
        if (lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l))) return <ul key={i} className="ml-5 list-disc space-y-1">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>;
        return lines.map((l, j) => (/^#{1,6}\s/.test(l) ? <h3 key={`${i}-${j}`} className="font-display text-base font-semibold">{l.replace(/^#+\s/, "")}</h3> : <p key={`${i}-${j}`}>{inline(l)}</p>));
      })}
    </div>
  );
}

function ActivityPanel({ s, events, q, t }: { s: LiveState; events: TraceEvent[]; q: ResearchQuestionRow; t: T }) {
  const box = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);
  const cur = PHASES.indexOf(s.phase === "done" ? "write" : s.phase);
  const usedPct = s.cap ? Math.min(100, (100 * s.counts.usd) / s.cap) : 0;
  return (
    <aside aria-label={t("research.live")} className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <section className={`${card} p-4`}>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold tracking-wide">{t("research.live")}</h2>
          <span className="ml-auto font-mono text-xs text-mute"><Elapsed from={s.started} to={s.finished} /></span>
        </div>
        <ol className="mt-3 grid grid-cols-5 gap-1" aria-label={t("research.live")}>
          {PHASES.map((p, i) => (
            <li key={p} className="flex flex-col items-center gap-1 text-center">
              <span aria-hidden="true" className={`h-1.5 w-full rounded-full ${s.phase === "done" || i < cur ? "bg-ok" : i === cur && q.status === "running" ? "animate-pulse bg-accent" : "bg-raised"}`} />
              <span className={`text-[10.5px] ${i === cur && s.phase !== "done" ? "font-semibold text-ink" : "text-mute"}`}>{t(`research.phase.${p}`)}</span>
            </li>
          ))}
        </ol>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {([["queries", s.counts.queries], ["pages", s.counts.pages], ["quotes", s.counts.quotes], ["claims", s.counts.claims], ["domains", s.counts.domains], ["tokens", s.counts.tokens.toLocaleString()]] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-raised px-2 py-1.5">
              <dt className="text-[10.5px] text-mute">{t(`research.stat.${k}`)}</dt>
              <dd className="font-display text-base font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {s.cap !== null && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-mute"><span>$</span><span>{t("research.budget", { spent: usdText(s.counts.usd), cap: usdText(s.cap) })}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised"><div className={`h-full rounded-full ${usedPct > 80 ? "bg-warn" : "bg-accent"}`} style={{ width: `${usedPct}%` }} /></div>
          </div>
        )}
      </section>
      {s.lanes.length > 0 && (
        <section className={`${card} p-4`}>
          <h3 className={label}>{t("research.lanes")}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {s.lanes.map((l) => (
              <li key={l.id} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-xs font-semibold ${laneColor(l.id)}`}>{l.id}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={l.title}>{l.title}</span>
                  <StatusBadge tone={l.state === "done" ? "green" : l.state === "waiting" ? "gray" : "blue"} label={t(`research.lane.${l.state}`)} />
                </div>
                {l.now && <p className="mt-1 truncate font-mono text-[11.5px] text-mute" title={l.now}>{l.state === "reading" ? "↓ " : "⌕ "}{l.now}</p>}
                <p className="mt-1 text-[11.5px] text-mute">{l.queries.length} {t("research.stat.queries")} · {l.read}/{l.fetched} {t("research.stat.pages")} · {l.quotes} {t("research.stat.quotes")}</p>
                {l.domains.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{l.domains.slice(0, 8).map((d) => <span key={d} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10.5px] text-mute">{d}</span>)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {s.roles.length > 0 && (
        <section className={`${card} p-4`}>
          <h3 className={label}>{t("research.models")}</h3>
          <table className="mt-2 w-full text-[12px]">
            <tbody>
              {s.roles.map((r) => (
                <tr key={`${r.role}${r.channel}${r.model}`} className="border-t border-line first:border-0">
                  <td className="py-1 pr-2">{t(`research.role.${r.role}`)}</td>
                  <td className="truncate py-1 pr-2 font-mono text-mute" title={`${r.channel} · ${r.model}`}>{r.model}</td>
                  <td className="py-1 pr-2 text-right text-mute">{t("research.calls", { n: r.calls })}{r.failed > 0 && <span className="text-bad"> ✕{r.failed}</span>}</td>
                  <td className="py-1 text-right font-mono">{usdText(r.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className={`${card} flex min-h-0 flex-col p-4`}>
        <h3 className={label}>{t("research.steps")} · {events.length}</h3>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-mute">{q.status === "queued" ? t("research.waiting") : t("research.liveEmpty")}</p>
        ) : (
          <ol ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }} className="mt-2 max-h-[420px] overflow-y-auto font-mono text-[11.5px] leading-relaxed" aria-live="polite">
            {events.slice(-400).map((e) => (
              <li key={e.seq} className="grid grid-cols-[52px_22px_14px_minmax(0,1fr)] gap-1">
                <span className="text-mute">{e.at.slice(11, 19)}</span>
                <span className={laneColor(e.lane)}>{e.lane ?? ""}</span>
                <span aria-hidden="true" className="text-mute">{ICON[e.kind]}</span>
                <span className={`break-words ${tone(e)}`}>{evText(e, t)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

export function ResearchLive({ initial }: { initial: ResearchFeed }) {
  const t = useT();
  const router = useRouter();
  const feed = useResearchFeed(initial);
  const { question: q, events, report } = feed;
  const s = useMemo(() => liveState(events), [events]);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = q.status === "queued" || q.status === "running";
  useEffect(() => {
    if (report) router.refresh();
    // refresh the question list once the report arrives
  }, [report !== null]);
  const stop = async () => {
    setStopping(true);
    const r = await postJson(`/api/research/${q.id}/stop`, {});
    if (r.status !== 200) {
      setStopping(false);
      setError(errorText(t, r));
    }
  };
  const base = `/api/research/${q.id}/report`;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className={`${card} rise p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={STATUS_TONE[q.status]} label={t(`research.st.${q.status}`)} />
            {q.depth && <span className="text-xs text-mute">{t(`research.depth.${q.depth}`)}</span>}
            {q.goal && <span className="text-xs text-mute">· {t(`research.goal.${q.goal}`)}</span>}
            <span className="text-xs text-mute">· {usdText(report?.stats.usd ?? s.counts.usd)}</span>
            <span className="ml-auto flex flex-wrap gap-2">
              {running && <button type="button" onClick={() => void stop()} disabled={stopping || q.stop_requested} className={btn.danger}>{stopping || q.stop_requested ? t("research.stopping") : t("research.stop")}</button>}
              {report && (
                <>
                  <a href={`${base}?format=html&view=1`} target="_blank" rel="noreferrer" className={btn.secondary}>{t("research.open")}</a>
                  <details className="relative">
                    <summary className={`${btn.primary} cursor-pointer list-none`}>{t("research.download")}</summary>
                    <div className={`${card} absolute right-0 z-10 mt-1 flex w-40 flex-col p-1 text-sm`}>
                      <a href={`${base}?format=html`} className="rounded px-3 py-1.5 hover:bg-raised">HTML</a>
                      <a href={`${base}?format=md`} className="rounded px-3 py-1.5 hover:bg-raised">Markdown</a>
                      <a href={`${base}?format=json`} className="rounded px-3 py-1.5 hover:bg-raised">JSON</a>
                    </div>
                  </details>
                </>
              )}
            </span>
          </div>
          <h1 className="mt-2 font-display text-xl font-semibold leading-snug">{report?.request.question ?? initial.question.question}</h1>
          {q.status === "failed" && <p role="alert" className="mt-2 text-sm text-bad">{t("research.failed", { why: q.error ?? "?" })}</p>}
          {report?.partial && <p className="mt-2 text-sm text-warn">{t("research.partialNote", { why: t(`research.partial.${report.partial}`) })}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
        </section>
        {report ? (
          <>
            <section className={`${card} rise p-5`}>
              <p className={label}>{t("research.answer")}</p>
              <div className="mt-2"><Cited text={report.summary} report={report} /></div>
            </section>
            {report.sections.map((x) => (
              <section key={x.title} className={`${card} rise p-5`}>
                <h2 className="font-display text-base font-semibold">{x.title}</h2>
                <div className="mt-2"><Cited text={x.body} report={report} /></div>
              </section>
            ))}
            <ClaimsList claims={report.claims.map((c) => ({ id: c.id, text: c.text, verdict: c.verdict, sources: c.source_ns.length, quotes: c.quote_ids.map((i) => report.quotes[i]).filter((x) => x !== undefined).map((x) => ({ text: x.text, n: report.sources.find((y) => y.id === x.source_id)?.n ?? 0, domain: report.sources.find((y) => y.id === x.source_id)?.domain ?? "" })) }))} t={t} />
            {report.unresolved.length > 0 && (
              <section className={`${card} rise p-5`}>
                <h2 className="font-display text-base font-semibold">{t("research.unresolved")}</h2>
                <ul className="mt-2 ml-5 list-disc text-sm text-mute">{report.unresolved.map((u, i) => <li key={i}>{u}</li>)}</ul>
              </section>
            )}
            <section className={`${card} rise overflow-x-auto p-5`}>
              <h2 className="font-display text-base font-semibold">{t("research.sources", { n: report.sources.length })}</h2>
              <ol className="mt-2 flex flex-col gap-1.5 text-sm">
                {report.sources.map((x) => (
                  <li key={x.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2">
                    <span className="font-mono text-xs text-mute">[{x.n}]</span>
                    <span className="min-w-0"><a href={x.final_url} target="_blank" rel="noreferrer noopener" className="block truncate">{x.title}</a><span className="block truncate font-mono text-[11px] text-mute">{x.domain}{x.published ? ` · ${x.published}` : ""} · {x.content_hash.slice(7, 19)}</span></span>
                    <span className="text-xs text-mute">{t(`research.tier.${x.tier}`)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : (
          <>
            {s.strategy && (
              <section className={`${card} rise p-5`}>
                <p className={label}>{t("research.plan")}</p>
                <p className="mt-2 text-sm">{s.strategy}</p>
                <ol className="mt-3 flex flex-col gap-1.5 text-sm">{s.lanes.map((l) => <li key={l.id}><span className={`mr-2 font-mono text-xs ${laneColor(l.id)}`}>{l.id}</span>{l.title} <span className="text-xs text-mute">· {t(`research.scope.${l.scope as "web"}`)}</span></li>)}</ol>
              </section>
            )}
            {(s.claims.length > 0 || s.sources.length > 0) && (
              <section className={`${card} rise p-5`}>
                <p className={label}>{t("research.foundSoFar")}</p>
                {s.claims.length > 0 && <ul className="mt-2 flex flex-col gap-1.5 text-sm">{s.claims.map((c) => <li key={c.id} className="flex items-start gap-2"><StatusBadge tone={VERDICT_TONE[c.verdict]} label={t(`research.v.${c.verdict}`)} /><span>{c.text}</span></li>)}</ul>}
                <ul className="mt-3 flex flex-wrap gap-1.5">{s.sources.map((x) => <li key={x.id}><a href={x.url} target="_blank" rel="noreferrer noopener" className="inline-block rounded border border-line px-2 py-0.5 font-mono text-[11px] text-mute no-underline hover:text-ink" title={x.url}>{x.domain} · {t("research.quotes", { n: x.quotes })}</a></li>)}</ul>
              </section>
            )}
          </>
        )}
      </div>
      <ActivityPanel s={s} events={events} q={q} t={t} />
    </div>
  );
}

function ClaimsList({ claims, t }: { claims: { id: string; text: string; verdict: ClaimVerdict; sources: number; quotes: { text: string; n: number; domain: string }[] }[]; t: T }) {
  if (claims.length === 0) return null;
  return (
    <section className={`${card} rise p-5`}>
      <h2 className="font-display text-base font-semibold">{t("research.claims")}</h2>
      <ul className="mt-2 divide-y divide-line">
        {claims.map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="flex items-start gap-2">
              <StatusBadge tone={VERDICT_TONE[c.verdict]} label={t(`research.v.${c.verdict}`)} />
              <span className="text-sm leading-relaxed">{c.text}</span>
            </div>
            <details className="mt-1 ml-1">
              <summary className="cursor-pointer text-xs text-mute">{t("research.quotes", { n: c.quotes.length })}</summary>
              <ul className="mt-1 flex flex-col gap-1">{c.quotes.map((q, i) => <li key={i} className="rounded-r border-l-2 border-line bg-raised px-3 py-1.5 text-[13px]">“{q.text}” <span className="font-mono text-[11px] text-mute">[{q.n}] {q.domain}</span></li>)}</ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
