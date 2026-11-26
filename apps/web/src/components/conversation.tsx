"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Brief, ChatTurn } from "@mandat/contract";
import { ORACLE_NOTE_MAX, limitResetsAt } from "@mandat/contract";
import { useT } from "../i18n/client";
import { pathOf } from "../lib/task-path";
import { answeringLine } from "../lib/chat";
import { TaskPath } from "./task-path";
import { OracleGrid } from "./oracle-grid";
import { useAgentName, whenShort } from "./agent-names";
import type { Key, T } from "../i18n/t";
import { isAnswering, isFollowing } from "../lib/conversation-types";
import type { ConversationFeed, ConversationRow, JobView, OracleView } from "../lib/conversation-types";
import type { BringReply } from "@mandat/contract";
import { JobCard } from "./job-card";
import { postJson } from "../lib/client/api";
import { Markdown } from "./markdown";
import { btn, input } from "./ui";

// D-531 (E10a phase 1): the conversation of "Ask first" in the task box. The turns come from the server's feed (SSE) while
// the worker answers; the model can ask, look in memory and propose a brief — the work starts only from "Start work".
// D-533: it also shows what the model read, the task profile with the axes still unclear, and the proposed spec with
// its criteria; a person approves a ready spec here. Kept small: the UI will be redesigned.
// D-534: under an approved spec that needs one, the oracle: building, not ready (why) or ready, red/green per criterion
// on the current code, and Approve oracle. Only statuses, criterion ids and counts reach the page, never the tests.

export interface Chat { row: ConversationRow; turns: ChatTurn[]; oracleRequired?: boolean; oracle?: OracleView | null; job?: JobView | null }

const merge = (a: ChatTurn[], b: ChatTurn[]): ChatTurn[] => {
  const seen = new Set(a.map((x) => x.seq));
  return [...a, ...b.filter((x) => !seen.has(x.seq))].sort((x, y) => x.seq - y.seq);
};

/** the conversation's state and its live feed: follow() opens the stream after the last turn and closes it once answered */
export function useConversation(initial: ConversationFeed | null): { chat: Chat | null; follow: (id: string) => void; reset: () => void } {
  const [chat, setChat] = useState<Chat | null>(initial ? { row: initial.conversation, turns: initial.turns, oracleRequired: initial.oracle_required ?? false, oracle: initial.oracle ?? null, job: initial.job ?? null } : null);
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
      setChat((c) => ({ row: f.conversation, turns: merge(c?.row.id === f.conversation.id ? c.turns : [], f.turns), oracleRequired: f.oracle_required ?? false, oracle: f.oracle ?? null, job: f.job ?? null }));
      if (!isFollowing(f)) stop();
    });
  }, []);
  const reset = useCallback(() => {
    stop();
    last.current = -1;
    setChat(null);
  }, []);
  useEffect(() => {
    if (initial && isFollowing(initial)) follow(initial.conversation.id);
    return stop;
  }, [initial, follow]);
  return { chat, follow, reset };
}

function BriefCard({ brief, t }: { brief: Brief; t: T }) {
  const rows: [string, string[]][] = [[t("chat.brief.touches"), brief.touches], [t("chat.brief.avoid"), brief.avoid], [t("chat.brief.done"), brief.done_when]];
  return (
    <section aria-label={t("chat.brief")} className="rounded-xl border border-accent-text/30 bg-accent-soft px-4 py-3 text-sm">
      <p className="text-xs font-medium text-mute">{t("chat.brief")}</p>
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

type ToolTurn = Extract<ChatTurn, { kind: "tool" }>;
type AxesTurn = Extract<ChatTurn, { kind: "axes" }>;
type SpecTurn = Extract<ChatTurn, { kind: "spec" }>;

function ToolLine({ turn, t }: { turn: ToolTurn; t: T }) {
  return (
    <p className="text-xs text-mute">
      {t(`chat.tool.${turn.tool}` as Key, { target: turn.target })}
      {turn.ok ? <span className="ml-2 font-mono">{turn.note}</span> : <span className="ml-2 text-warn">{t("chat.tool.refused", { note: turn.note })}</span>}
    </p>
  );
}

function AxesCard({ turn, t }: { turn: AxesTurn; t: T }) {
  return (
    <section aria-label={t("chat.profile")} className="rounded-xl border border-line-strong bg-panel px-4 py-2.5 text-sm">
      <p className="font-medium">{t("chat.profileName", { name: t(`chat.taskProfile.${turn.profile}` as Key) })}</p>
      <p className={turn.unknown.length > 0 ? "text-warn" : "text-mute"}>
        {turn.unknown.length > 0 ? t("chat.axesOpen", { axes: turn.unknown.map((a) => t(`chat.axis.${a}` as Key)).join(", ") }) : t("chat.axesKnown")}
      </p>
    </section>
  );
}

export interface SpecActions { row: ConversationRow; canApprove: boolean; busy: boolean; onApprove: (hash: string) => void }

function SpecCard({ turn, t, a }: { turn: SpecTurn; t: T; a: SpecActions }) {
  const s = turn.spec;
  const approved = a.row.approved_spec_hash === turn.hash;
  const current = a.row.spec_hash === turn.hash;
  const lists: [string, string[]][] = [[t("chat.spec.unchanged"), s.unchanged], [t("chat.spec.outOfScope"), s.out_of_scope]];
  return (
    <section aria-label={t("chat.spec")} className="rounded-xl border border-accent-text/30 bg-accent-soft px-4 py-3 text-sm">
      <p className="text-xs font-medium text-mute">{t("chat.spec")} · {t(`chat.taskProfile.${s.profile}` as Key)}</p>
      <p className="mt-1 text-[15px] font-medium">{s.goal}</p>
      {s.product.trim() !== "" && <p className="mt-1 whitespace-pre-wrap">{s.product}</p>}
      <p className="mt-3 text-mute">{t("chat.spec.criteria")}</p>
      <ol className="mt-1 space-y-1">
        {s.criteria.map((c) => (
          <li key={c.id} className={turn.untestable.includes(c.id) ? "text-warn" : undefined}>
            <span className="font-mono text-xs">{c.id}</span> {t("chat.spec.criterion", { when: c.when, shall: c.shall })} <span className="text-xs text-mute">({t("chat.spec.proof", { proof: c.proof })})</span>
          </li>
        ))}
      </ol>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {lists.filter(([, xs]) => xs.length > 0).map(([k, xs]) => (
          <div key={k} className="contents">
            <dt className="text-mute">{k}</dt>
            <dd>{xs.join(" · ")}</dd>
          </div>
        ))}
      </dl>
      {!turn.ready && (
        <div className="mt-2 text-xs text-warn">
          <p>{t("chat.spec.notReady")}</p>
          {turn.unknown.length > 0 && <p>{t("chat.axesOpen", { axes: turn.unknown.map((x) => t(`chat.axis.${x}` as Key)).join(", ") })}</p>}
          {turn.untestable.length > 0 && <p>{t("chat.spec.untestable", { ids: turn.untestable.join(", ") })}</p>}
        </div>
      )}
      {turn.ready && approved && <p className="mt-2 text-xs font-medium text-ok">{t("chat.spec.approved")}</p>}
      {turn.ready && !approved && !current && <p className="mt-2 text-xs text-mute">{t("chat.spec.replaced")}</p>}
      {turn.ready && !approved && current && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-mute">{t("chat.spec.ready")}</p>
          {a.canApprove && <button type="button" className={btn.primary} disabled={a.busy} onClick={() => a.onApprove(turn.hash)}>{a.busy ? t("chat.spec.approving") : t("chat.spec.approve")}</button>}
        </div>
      )}
    </section>
  );
}

export interface OracleActions { canApprove: boolean; busy: boolean; onBuild: (note?: string) => void; onApprove: (hash: string) => void; jobParked?: boolean }

function OracleCard({ oracle, t, a }: { oracle: OracleView | null; t: T; a: OracleActions }) {
  const s = oracle?.status ?? null;
  // D-572: after a parked job a person may build an approved oracle again
  const canBuild = a.canApprove && (s === null || s === "not_ready" || s === "failed" || (s === "approved" && a.jobParked === true));
  // D-593: building again, the person may say what the last oracle got wrong (it reaches the oracle agent as their words)
  const [note, setNote] = useState("");
  const again = canBuild && s !== null;
  return (
    <section aria-label={t("chat.oracle")} className="rounded-xl border border-line-strong bg-panel px-4 py-3 text-sm">
      <p className="text-xs font-medium text-mute">{t("chat.oracle")}</p>
      {s === null && <p className="mt-1 text-mute">{t("chat.oracle.none")}</p>}
      {s === "building" && <p className="mt-1 text-mute">{t("chat.oracle.building")}</p>}
      {s === "failed" && <p className="mt-1 text-warn">{t("chat.oracle.failed")}</p>}
      {s === "not_ready" && oracle && (
        <div className="mt-1 text-warn">
          <p>{t("chat.oracle.notReady")}</p>
          <ul className="list-disc pl-5 text-xs">{oracle.problems.map((p) => <li key={`${p.kind}:${p.id}`}>{t((p.kind === "no_api" && p.id !== "API.md" ? "chat.oracle.problem.no_api_name" : `chat.oracle.problem.${p.kind}`) as Key, { id: p.id })}</li>)}</ul>
        </div>
      )}
      {s === "ready" && oracle && <p className="mt-1">{t("chat.oracle.ready", { tests: String(oracle.tests) })}</p>}
      {s === "approved" && <p className="mt-1 font-medium text-ok">{t("chat.oracle.approved")}</p>}
      {oracle && oracle.red_on_base.length > 0 && (s === "ready" || s === "approved" || s === "not_ready") && <OracleGrid cells={oracle.red_on_base} t={t} />}
      {(canBuild || (s === "ready" && a.canApprove)) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {canBuild && <p className="min-w-0 flex-1 text-xs text-mute">{t(s === "approved" ? "chat.oracle.parked" : "chat.oracle.needed")}</p>}
          {again && (
            <label className="block w-full text-xs text-mute">
              {t("chat.oracle.noteLabel")}
              <textarea className={`${input} mt-1 min-h-16`} rows={3} maxLength={ORACLE_NOTE_MAX} value={note} placeholder={t("chat.oracle.notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
          {canBuild && <button type="button" className={btn.secondary} disabled={a.busy} onClick={() => a.onBuild(again && note.trim() !== "" ? note.trim() : undefined)}>{t(s === null ? "chat.oracle.build" : "chat.oracle.rebuild")}</button>}
          {s === "ready" && oracle?.oracle_hash && <button type="button" className={btn.primary} disabled={a.busy} onClick={() => a.onApprove(oracle.oracle_hash as string)}>{t("chat.oracle.approve")}</button>}
        </div>
      )}
    </section>
  );
}

/** D-557: the brief of the whole project the model proposed; an approver approves it by its hash */
function ProjectCard({ turn, t, a }: { turn: Extract<ChatTurn, { kind: "project" }>; t: T; a: SpecActions }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(a.row.project_approved ? "done" : "idle");
  const b = turn.brief;
  const list = (xs: readonly string[]) => (xs.length > 0 ? xs.join(" · ") : "—");
  const approve = async () => {
    setState("busy");
    const r = await postJson(`/api/conversations/${a.row.id}/approve-project`, { brief_hash: turn.hash });
    setState(r.status === 200 ? "done" : "error");
  };
  const rows: [Key, string, string][] = [
    ["project.brief.product", b.product, "product"],
    ["project.brief.users", list(b.users), "users"],
    ["project.brief.works", list(b.works_today), "works_today"],
    ["project.brief.keep", list(b.must_not_break), "must_not_break"],
    ["project.brief.tests", b.commands.test ?? "—", "commands.test"],
    ["project.brief.stack", list(b.stack), "stack"],
    ["project.brief.approver", `${b.approver} · ${b.budget_usd} USD`, "approver"],
  ];
  return (
    <section aria-label={t("project.brief.title")} className="max-w-[46rem] rounded-xl border border-line-strong bg-panel px-4 py-3 text-sm">
      <p className="text-xs font-medium text-mute">{t("project.brief.title")}</p>
      {/* D-599: the brief as tiles (the brand kit's profile tiles); a part the model still lacks is a dashed amber tile */}
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {rows.map(([k, v, field]) => {
          const lacking = turn.missing.includes(field);
          return (
            <li key={k} className={`flex flex-col gap-1 rounded-[10px] border px-3 py-2.5 ${lacking ? "border-dashed border-warn bg-warn-soft" : "border-line bg-canvas"}`}>
              <span className="text-xs font-medium text-mute">{t(k)}</span>
              <span className={`whitespace-pre-wrap ${lacking ? "text-warn" : ""}`}>{lacking ? t("project.brief.lacking") : v}</span>
            </li>
          );
        })}
      </ul>
      {!turn.ready && <p className="mt-2 text-warn">{t("project.brief.missing", { what: turn.missing.join(", ") })}</p>}
      {turn.ready && state === "done" && <p className="mt-2 font-medium text-ok">{t("project.brief.approved")}</p>}
      {turn.ready && state !== "done" && a.canApprove && (
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className={btn.primary} disabled={state === "busy" || a.busy} onClick={() => void approve()}>{t("project.brief.approve")}</button>
          {state === "error" && <span role="alert" className="text-bad">{t("project.brief.failed")}</span>}
        </div>
      )}
    </section>
  );
}

function Turn({ turn, t, a }: { turn: ChatTurn; t: T; a: SpecActions }) {
  if (turn.kind === "human") {
    return (
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-raised px-4 py-2.5 text-[15px]">
        <p className="text-[11px] font-medium text-mute">{t("ws.you")}</p>
        <p className="whitespace-pre-wrap">{turn.text}</p>
      </div>
    );
  }
  if (turn.kind === "memory") return <p className="text-xs text-mute">{t("chat.memory", { query: turn.query })}</p>;
  if (turn.kind === "tool") return <ToolLine turn={turn} t={t} />;
  if (turn.kind === "axes") return <AxesCard turn={turn} t={t} />;
  if (turn.kind === "spec") return <SpecCard turn={turn} t={t} a={a} />;
  if (turn.kind === "project") return <ProjectCard turn={turn} t={t} a={a} />;
  // D-599: a note of the interview — the brief beside the conversation writes it; here one quiet line says what was noted
  if (turn.kind === "project_note") {
    return (
      <p className="flex items-center gap-2 font-mono text-[11px] text-mute">
        <span aria-hidden="true" className={`size-1.5 rotate-45 ${turn.from === "code" ? "bg-info" : "bg-accent"}`} />
        {t("project.noted", { parts: Object.keys(turn.parts).join(", ") })} · {t(turn.from === "code" ? "interview.fromCode" : "interview.fromYou")}
      </p>
    );
  }
  return (
    <div className="max-w-[46rem] space-y-3">
      <p className="text-[11px] font-medium text-mute">{t("chat.assistant")}</p>
      {turn.unreadable ? <p className="text-sm text-warn">{t("chat.unreadable")}</p> : turn.text.trim() !== "" && <Markdown src={turn.text} className="text-[15px]" />}
      {turn.questions.length > 0 && (
        <ol aria-label={t("chat.questions")} className="list-decimal space-y-1 pl-5 text-[15px]">
          {turn.questions.map((q) => <li key={q}>{q}</li>)}
        </ol>
      )}
      {turn.brief && <BriefCard brief={turn.brief} t={t} />}
    </div>
  );
}

const STOP: Partial<Record<ConversationRow["status"], "chat.overloaded" | "chat.failed" | "chat.budget" | "chat.expired" | "chat.limit">> = { overloaded: "chat.overloaded", failed: "chat.failed", budget: "chat.budget", expired: "chat.expired", limit: "chat.limit" };

/** D-591: the stop's words; a spent subscription says when it resets (local time) or that the time is unknown */
export function stopText(t: T, status: ConversationRow["status"], error: string | null): string | null {
  const key = STOP[status];
  if (!key) return null;
  if (key !== "chat.limit") return t(key);
  const at = limitResetsAt(error);
  return at === null ? t("chat.limitUnknown") : t("chat.limit", { time: new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) });
}

/** the turns, the "thinking" line while the worker answers, and a clear stop with its way out */
/** D-610: who runs this conversation — the account (its email) and the model, and whether that account is out of its limit */
function Runner({ agent, model, t }: { agent: string; model: string | null; t: T }) {
  const name = useAgentName()(agent);
  return (
    <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-xs text-mute">
      <span className="text-ink">{name.label}</span>
      {model && <span className="font-mono">{model}</span>}
      {name.limitedUntil && <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-warn">{t("agent.limited", { when: whenShort(name.limitedUntil, t.lang) })}</span>}
    </p>
  );
}

export function ChatThread({ chat, onRetry, onNew, busy, canApprove = false, onApprove = () => undefined, onBuildOracle = () => undefined, onApproveOracle = () => undefined, onApproveJob = () => undefined, onBring, brought = null }: { chat: Chat; onRetry: () => void; onNew: () => void; busy: boolean; canApprove?: boolean; onApprove?: (hash: string) => void; onBuildOracle?: (note?: string) => void; onApproveOracle?: (hash: string) => void; onApproveJob?: (sealHash: string, code?: string) => void; onBring?: () => void; brought?: BringReply | null }) {
  const t = useT();
  const end = useRef<HTMLDivElement | null>(null);
  // a block body: newer Chromium returns a Promise from scrollIntoView, and React would call it as the cleanup
  useEffect(() => {
    void end.current?.scrollIntoView({ block: "end" });
  }, [chat.turns.length, chat.row.status]);
  const stop = stopText(t, chat.row.status, chat.row.error);
  const retryable = chat.row.status === "overloaded" || chat.row.status === "failed" || chat.row.status === "limit";
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1" aria-live="polite" aria-relevant="additions">
      {/* D-599: the path of the task (the strap), above the conversation; not for the interview of a whole project */}
      {chat.row.purpose === "task" && (
        <div className="sticky -top-5 z-10 -mt-5 border-b border-line bg-canvas pb-3 pt-5">
          <TaskPath stops={pathOf({ conversation: chat.row, turns: chat.turns, oracle_required: chat.oracleRequired ?? false, oracle: chat.oracle ?? null, job: chat.job ?? null })} t={t} />
          <Runner agent={chat.row.agent} model={chat.row.model} t={t} />
        </div>
      )}
      {chat.turns.map((x) => <Turn key={x.seq} turn={x} t={t} a={{ row: chat.row, canApprove, busy, onApprove }} />)}
      {chat.row.approved_spec_hash !== null && chat.oracleRequired && <OracleCard oracle={chat.oracle ?? null} t={t} a={{ canApprove, busy, onBuild: onBuildOracle, onApprove: onApproveOracle, jobParked: chat.job?.status === "parked" }} />}
      {chat.job && <JobCard job={chat.job} t={t} a={{ canApprove, busy, onApprove: onApproveJob, brought, ...(onBring ? { onBring } : {}) }} />}
      {isAnswering(chat.row.status) && (
        <p className="flex items-center gap-2 text-sm text-mute">
          <span aria-hidden="true" className="inline-flex gap-1"><span className="size-1.5 animate-bounce rounded-full bg-mute" /><span className="size-1.5 animate-bounce rounded-full bg-mute [animation-delay:150ms]" /><span className="size-1.5 animate-bounce rounded-full bg-mute [animation-delay:300ms]" /></span>
          {/* D-599: what it answers, never only "Thinking…" */}
          {(() => { const l = answeringLine(chat.turns); return t(l.key, l.params); })()}
        </p>
      )}
      {stop && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <span className="min-w-0 flex-1">{stop}</span>
          {retryable ? <button type="button" className={btn.secondary} onClick={onRetry} disabled={busy}>{t("chat.retry")}</button> : <button type="button" className={btn.secondary} onClick={onNew}>{t("chat.new")}</button>}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
