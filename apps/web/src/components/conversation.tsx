"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Brief, ChatTurn } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { T } from "../i18n/t";
import { isAnswering } from "../lib/conversation-types";
import type { ConversationFeed, ConversationRow } from "../lib/conversation-types";
import { Markdown } from "./markdown";
import { btn } from "./ui";

// D-531 (E10a phase 1): the conversation of "Ask first" in the task box. The turns come from the server's feed (SSE) while
// the worker answers; the model can ask, look in memory and propose a brief — the work starts only from "Start work".

export interface Chat { row: ConversationRow; turns: ChatTurn[] }

const merge = (a: ChatTurn[], b: ChatTurn[]): ChatTurn[] => {
  const seen = new Set(a.map((x) => x.seq));
  return [...a, ...b.filter((x) => !seen.has(x.seq))].sort((x, y) => x.seq - y.seq);
};

/** the conversation's state and its live feed: follow() opens the stream after the last turn and closes it once answered */
export function useConversation(initial: ConversationFeed | null): { chat: Chat | null; follow: (id: string) => void; reset: () => void } {
  const [chat, setChat] = useState<Chat | null>(initial ? { row: initial.conversation, turns: initial.turns } : null);
  const es = useRef<EventSource | null>(null);
  const last = useRef(initial?.turns.at(-1)?.seq ?? -1);
  const stop = () => {
    es.current?.close();
    es.current = null;
  };
  const follow = useCallback((id: string) => {
    stop();
    const src = new EventSource(`/api/conversations/${id}/stream?after=${last.current}`);
    es.current = src;
    src.addEventListener("feed", (ev) => {
      const f = JSON.parse((ev as MessageEvent<string>).data) as ConversationFeed;
      last.current = f.turns.at(-1)?.seq ?? last.current;
      setChat((c) => ({ row: f.conversation, turns: merge(c?.row.id === f.conversation.id ? c.turns : [], f.turns) }));
      if (!isAnswering(f.conversation.status)) stop();
    });
  }, []);
  const reset = useCallback(() => {
    stop();
    last.current = -1;
    setChat(null);
  }, []);
  useEffect(() => {
    if (initial && isAnswering(initial.conversation.status)) follow(initial.conversation.id);
    return stop;
  }, [initial, follow]);
  return { chat, follow, reset };
}

function BriefCard({ brief, t }: { brief: Brief; t: T }) {
  const rows: [string, string[]][] = [[t("chat.brief.touches"), brief.touches], [t("chat.brief.avoid"), brief.avoid], [t("chat.brief.done"), brief.done_when]];
  return (
    <section aria-label={t("chat.brief")} className="rounded-xl border border-accent-text/30 bg-accent-soft px-4 py-3 text-sm">
      <p className="font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">{t("chat.brief")}</p>
      <p className="mt-1 text-[15px] font-medium">{brief.goal}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.filter(([, xs]) => xs.length > 0).map(([k, xs]) => (
          <div key={k} className="contents">
            <dt className="text-mute">{k}</dt>
            <dd>{xs.join(" · ")}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-mute">{t("chat.briefHint")}</p>
    </section>
  );
}

function Turn({ turn, t }: { turn: ChatTurn; t: T }) {
  if (turn.kind === "human") {
    return (
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-raised px-4 py-2.5 text-[15px]">
        <p className="text-[11px] font-medium text-mute">{t("ws.you")}</p>
        <p className="whitespace-pre-wrap">{turn.text}</p>
      </div>
    );
  }
  if (turn.kind === "memory") return <p className="text-xs text-mute">{t("chat.memory", { query: turn.query })}</p>;
  return (
    <div className="max-w-[46rem] space-y-3">
      <p className="text-[11px] font-medium text-mute">{t("chat.assistant")}</p>
      {turn.text.trim() !== "" && <Markdown src={turn.text} className="text-[15px]" />}
      {turn.questions.length > 0 && (
        <ol aria-label={t("chat.questions")} className="list-decimal space-y-1 pl-5 text-[15px]">
          {turn.questions.map((q) => <li key={q}>{q}</li>)}
        </ol>
      )}
      {turn.brief && <BriefCard brief={turn.brief} t={t} />}
    </div>
  );
}

const STOP: Partial<Record<ConversationRow["status"], "chat.overloaded" | "chat.failed" | "chat.budget" | "chat.expired">> = { overloaded: "chat.overloaded", failed: "chat.failed", budget: "chat.budget", expired: "chat.expired" };

/** the turns, the "thinking" line while the worker answers, and a clear stop with its way out */
export function ChatThread({ chat, onRetry, onNew, busy }: { chat: Chat; onRetry: () => void; onNew: () => void; busy: boolean }) {
  const t = useT();
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [chat.turns.length, chat.row.status]);
  const stop = STOP[chat.row.status];
  const retryable = chat.row.status === "overloaded" || chat.row.status === "failed";
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1" aria-live="polite" aria-relevant="additions">
      {chat.turns.map((x) => <Turn key={x.seq} turn={x} t={t} />)}
      {isAnswering(chat.row.status) && (
        <p className="flex items-center gap-2 text-sm text-mute">
          <span aria-hidden="true" className="inline-flex gap-1"><span className="size-1.5 animate-bounce rounded-full bg-mute" /><span className="size-1.5 animate-bounce rounded-full bg-mute [animation-delay:150ms]" /><span className="size-1.5 animate-bounce rounded-full bg-mute [animation-delay:300ms]" /></span>
          {t("chat.thinking")}
        </p>
      )}
      {stop && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <span className="min-w-0 flex-1">{t(stop)}</span>
          {retryable ? <button type="button" className={btn.secondary} onClick={onRetry} disabled={busy}>{t("chat.retry")}</button> : <button type="button" className={btn.secondary} onClick={onNew}>{t("chat.new")}</button>}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
