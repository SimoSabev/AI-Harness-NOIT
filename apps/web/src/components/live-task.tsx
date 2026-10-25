"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/client";
import type { T } from "../i18n/t";
import { chatItems, toolIcon, usageOf, whyOf } from "../lib/chat";
import type { ChatItem, Feed, FeedCheck, ToolIcon } from "../lib/chat";
import { errorText, postJson } from "../lib/client/api";
import { outcomeTone, statusOf } from "../lib/status";
import type { Tone } from "../lib/status";
import { reasonText } from "../lib/verdict-view";
import { splitDiff } from "../lib/diff-view";
import { AskCards } from "./ask-cards";
import type { AskView } from "./ask-cards";
import { FileViewer } from "./file-viewer";
import { LocalActions } from "./local-access";
import { Markdown } from "./markdown";
import { TaskActions } from "./task-actions";
import { StatusBadge, btn } from "./ui";

// The one view of a task (D-386). While the agent works: what you asked and every step of the agent as it happens
// (SSE, /api/tasks/:id/stream), with a box to steer it. When it is done, top to bottom: the verdict in one sentence
// with the reasons, the change, the decision — then, folded, what the agent did and the details (checks, trust, cost).
function useFeed(id: string, initial: Feed | null): { feed: Feed | null; online: boolean } {
  const [feed, setFeed] = useState<Feed | null>(initial);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    setFeed(initial);
    const after = initial?.lines.at(-1)?.seq ?? -1;
    const es = new EventSource(`/api/tasks/${id}/stream?after=${after}`);
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    es.addEventListener("feed", (e) => {
      setOnline(true);
      const f = JSON.parse((e as MessageEvent<string>).data) as Feed;
      setFeed((cur) => {
        if (!cur || cur.session !== f.session) return f;
        const seen = new Set(cur.lines.map((l) => l.seq));
        return { ...f, lines: [...cur.lines, ...f.lines.filter((l) => !seen.has(l.seq))] };
      });
    });
    return () => es.close();
    // the stream is per task; `initial` only seeds it (the page remounts this component per task)
  }, [id]);
  return { feed, online };
}

const ICON: Record<ToolIcon, string> = { read: "◎", edit: "✎", run: "$", search: "⌕", plug: "⌁", tool: "•" };
const BOX: Record<Tone, string> = { red: "bg-bad-soft text-bad", green: "bg-ok-soft text-ok", amber: "bg-warn-soft text-warn", blue: "bg-raised text-ink", gray: "bg-raised text-ink" };

function Item({ it, t }: { it: ChatItem; t: T }) {
  if (it.kind === "say") return <Markdown src={it.text} className="max-w-[46rem] text-[15px]" />;
  if (it.kind === "steer")
    return (
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm border border-accent-text/30 bg-accent-soft px-4 py-2 text-sm">
        <p className="text-[11px] font-medium text-accent-text">{t("ws.steerYou")}</p>
        <p className="whitespace-pre-wrap">{it.text}</p>
      </div>
    );
  if (it.kind === "sub") return <p className="text-xs text-mute">{t(it.start ? "ws.sub.start" : "ws.sub.stop", { name: it.text || "—" })}</p>;
  if (it.kind === "end")
    return <p className={`text-sm ${it.ok ? "text-ok" : "text-bad"}`}>{it.ok ? t("ws.end.ok") : t("ws.end.failed", { reason: it.text || "—" })}</p>;
  const icon = toolIcon(it.name);
  const tone = it.state === "denied" || it.state === "error" ? "border-bad/40" : it.state === "run" ? "border-info/50" : "border-line";
  return (
    <details className={`group max-w-[46rem] rounded-lg border ${tone} bg-panel text-sm`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span aria-hidden="true" className="w-4 text-center font-mono text-mute">{ICON[icon]}</span>
        <span className="text-mute">{t(`ws.tool.${icon}`)}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{it.summary || it.name}</span>
        {it.state === "run" && <span aria-hidden="true" className="inline-block size-2 animate-pulse rounded-full bg-info" />}
        {it.state === "denied" && <span className="rounded bg-bad-soft px-1.5 text-xs text-bad">{t("ws.tool.denied")}</span>}
        {it.state === "error" && <span className="rounded bg-bad-soft px-1.5 text-xs text-bad">{t("ws.tool.error")}</span>}
      </summary>
      {it.output && <pre className="max-h-64 overflow-auto border-t border-line px-3 py-2 font-mono text-xs whitespace-pre-wrap text-mute">{it.output}</pre>}
    </details>
  );
}

function Composer({ id, codex, t }: { id: string; codex: boolean; t: T }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (codex) return <p className="text-center text-sm text-mute">{t("steer.codex")}</p>;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return;
    setBusy(true);
    const r = await postJson(`/api/tasks/${id}/steer`, { text: text.trim() });
    setBusy(false);
    if (r.status !== 200) return setMsg(errorText(t, r));
    setText("");
    setMsg(r.body.live === true ? t("steer.sentLive") : t("steer.sentLater"));
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-1">
      <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-panel p-2 focus-within:border-accent-text">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={1} aria-label={t("steer.note")} placeholder={t("ws.steerPlaceholder")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-mute" />
        <button type="submit" className={btn.primary} disabled={busy || text.trim() === ""}>{t("ws.steerSend")}</button>
      </div>
      {msg && <p role="status" className="px-2 text-xs text-mute">{msg}</p>}
    </form>
  );
}

export interface TaskView {
  evidence: FeedCheck[];
  /** null for a viewer, or when the change was too large to keep (then `diffOmitted` holds its size) */
  diff: string | null;
  diffOmitted: number | null;
  asks: AskView[];
  repoId: string;
}

export function LiveTask({ id, initial, canAct, agentName, view, shots, details }: { id: string; initial: Feed | null; canAct: boolean; agentName: string; view: TaskView; shots: React.ReactNode; details: React.ReactNode }) {
  const t = useT();
  const { feed, online } = useFeed(id, initial);
  const task = feed?.task ?? null;
  const items = useMemo(() => chatItems(feed?.lines ?? [], feed?.steers ?? []), [feed?.lines, feed?.steers]);
  const usage = useMemo(() => usageOf(feed?.lines ?? []), [feed?.lines]);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, task?.state]);
  // the verdict, the change and the task list are server-rendered: refresh them when this task changes state
  const router = useRouter();
  const lastState = useRef(task?.state);
  useEffect(() => {
    if (task && lastState.current !== task.state) router.refresh();
    lastState.current = task?.state;
  }, [task?.state, task, router]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  if (!task) return null;

  const s = statusOf(task, t.lang);
  const active = s.key === "queued" || s.key === "running" || s.key === "checking";
  const steps = items.filter((i) => i.kind === "tool").length;
  const started = feed?.lines[0]?.at ? Date.parse(feed.lines[0].at) : null;
  const secs = started ? Math.max(0, Math.round(((active ? now : Date.parse(feed?.lines.at(-1)?.at ?? task.updated_at)) - started) / 1000)) : null;
  const files = view.diff ? splitDiff(view.diff) : [];
  const notes = feed?.notes ?? [];
  const ask = [...notes].reverse().find((n) => n.kind === "needs_you");
  const appliedNote = [...notes].reverse().find((n) => n.kind === "auto_applied" || n.kind === "applied");
  const waitingYou = s.key === "review" || s.key === "unknown";
  const failed = view.evidence.filter((e) => e.status === "fail" || e.status === "unknown");

  const conversation = (
    <>
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-raised px-4 py-2.5 text-[15px]">
        <p className="text-[11px] font-medium text-mute">{t("ws.you")}</p>
        <p className="whitespace-pre-wrap">{task.text}</p>
      </div>
      {items.map((it, k) => <Item key={`${it.kind}-${it.seq}-${k}`} it={it} t={t} />)}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-3 text-sm text-mute">
        <StatusBadge tone={s.tone} label={s.label} />
        <span>{agentName}</span>
        {active && !online && <span className="ml-auto text-xs">{t("ws.offline")}</span>}
      </div>

      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1" aria-live="polite" aria-relevant="additions">
        {active ? (
          <>
            {conversation}
            <p className="flex items-center gap-2 text-sm text-mute">
              <span aria-hidden="true" className="inline-flex gap-1"><span className="size-1.5 animate-bounce rounded-full bg-mute" /><span className="size-1.5 animate-bounce rounded-full bg-mute [animation-delay:150ms]" /><span className="size-1.5 animate-bounce rounded-full bg-mute [animation-delay:300ms]" /></span>
              {s.key === "checking" ? t("ws.checking") : s.key === "running" ? t("ws.typing") : t("ws.waiting")}
            </p>
            <TaskActions taskId={task.id} status={s.key} canAct={canAct} changesetId={task.changeset_id} headSha={task.head_sha} twoFactor={task.requires_second_factor} />
          </>
        ) : (
          <>
            <section aria-label={t("ws.outcome")} className={`rounded-xl px-4 py-3 text-sm ${BOX[outcomeTone(task.last_result, s.tone)]}`}>
              <p className="font-medium">{s.headline}</p>
              {appliedNote && <p className="mt-1 font-mono text-xs">{t("ws.applied", { range: appliedNote.text })}</p>}
              {waitingYou && ask && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {whyOf(ask.text).map((w, k) => (
                    <li key={k}>{t(w.key, { n: w.n ?? 0 })}{w.path && <> · <code className="font-mono text-xs">{w.path}</code></>}</li>
                  ))}
                </ul>
              )}
              {s.key !== "review" && (failed.length > 0 || task.reasons.length > 0) && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {failed.length > 0 ? failed.map((e, k) => <li key={k}>{e.signature ? reasonText(e.signature, t.lang) : e.summary}</li>) : task.reasons.map((r) => <li key={r}>{reasonText(r, t.lang)}</li>)}
                </ul>
              )}
            </section>
            {files.length > 0 && (
              <section aria-label={t("task.change")} className="space-y-2">
                <p className="text-xs font-medium text-mute">{t("task.change")} · {t("res.files", { n: files.length })}</p>
                <FileViewer files={files} />
              </section>
            )}
            {files.length === 0 && view.diffOmitted !== null && <p className="rounded-xl bg-raised px-4 py-3 text-sm text-mute">{t("res.tooLarge", { mb: t.num(view.diffOmitted / 1048576, 1) })}</p>}
            {shots}
            <TaskActions taskId={task.id} status={s.key} canAct={canAct} changesetId={task.changeset_id} headSha={task.head_sha} twoFactor={task.requires_second_factor} />
            {files.length > 0 && <LocalActions taskId={task.id} repoId={view.repoId} files={files.map((f) => f.path)} />}
            {view.asks.length > 0 && <AskCards taskId={task.id} asks={view.asks} attempt={view.asks[0]?.attempt ?? 1} canDecide={canAct && s.key === "ask"} />}
            <details className="rounded-xl border border-line px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-mute hover:text-ink">{t("ws.log", { n: steps })}</summary>
              <div className="mt-4 space-y-4">{conversation}</div>
            </details>
            <details className="rounded-xl border border-line px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-mute hover:text-ink">{t("ws.details")}</summary>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[
                  [t("ws.time"), secs === null ? "—" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`],
                  [t("ws.cost"), task.usd > 0 ? t.usd(task.usd) : usage?.usd ? t.usd(usage.usd) : "—"],
                  [t("ws.tokens"), usage ? t.num(usage.input + usage.output) : "—"],
                  [t("ws.context"), feed?.context_pct != null ? `${Math.round(feed.context_pct)}%` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-raised px-3 py-2">
                    <dt className="text-[11px] text-mute">{k}</dt>
                    <dd className="font-mono text-base">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6">{details}</div>
            </details>
          </>
        )}
      </div>

      {active && canAct && (
        <div className="border-t border-line pt-3">
          <Composer id={id} codex={task.agent === "codex" || task.agent.startsWith("fake-codex:")} t={t} />
        </div>
      )}
    </div>
  );
}
