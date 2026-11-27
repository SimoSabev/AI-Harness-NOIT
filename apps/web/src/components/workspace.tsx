"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import type { Tone } from "../lib/status";
import { Hex, Tip, btn } from "./ui";
import { Select } from "./select";
import { ChatThread, useConversation } from "./conversation";
import { ProjectProfile } from "./project-profile";
import { cleanTitle } from "../lib/task-groups";
import { AgentNames, whenShort } from "./agent-names";
import { InterviewStep } from "./interview-step";
import { openQuestions } from "../lib/interview";
import { NEW_PROJECT, boxRepo, canStartWork, projectChoices, sendsOnEnter, withAdded } from "../lib/chat";
import { byProject } from "../lib/task-list";
import { AddProject } from "./local-access";
import type { AddedProject } from "./add-project-form";
import { isAnswering } from "../lib/conversation-types";
import type { ConversationFeed } from "../lib/conversation-types";
import { BringReply } from "@mandat/contract";
import type { HomeBrief, HomeQueue } from "../lib/home";
import { composerHeight } from "../lib/side-pane";

/** D-619: the start — Harnova's line and the dashboard of the list */
export type HomeView = HomeBrief & { queue: HomeQueue<WsTask> };


// The workspace's left column (the tasks, like the chats of an assistant) and the empty state: one box to start a task.
export interface WsSub { id: string; href: string; text: string; tone: Tone; label: string; ago: string }
/** D-633: a session of the list — a conversation (its tasks are `subs`) or a task on its own — and its project */
export interface WsTask extends WsSub { project: string | null; projectName: string; subs?: WsSub[]; /** D-709: a sealed job waits for the person's review */ review?: boolean }
/** D-393: an agent of the task box with the models it can use (lib/agents.ts taskAgents) */
export interface WsAgent { id: string; label: string; models: string[]; defaultModel: string | null; /** D-612 */ limitedUntil?: string | null | undefined }

// D-633: what is folded in the list, remembered in this browser (a per-viewer convenience): projects start open,
// sessions with sub-sessions start folded; the session holding the open task is always unfolded
const FOLD_KEY = "harnova.list.fold";
function useFold(): [Record<string, boolean>, (id: string, open: boolean) => void] {
  const [fold, setFold] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "{}");
      if (v && typeof v === "object") setFold(Object.fromEntries(Object.entries(v).filter((e): e is [string, boolean] => typeof e[1] === "boolean")));
    } catch { /* nothing remembered */ }
  }, []);
  const set = (id: string, open: boolean) => setFold((prev) => {
    const next = { ...prev, [id]: open };
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(Object.fromEntries(Object.entries(next).slice(-300)))); } catch { /* kept for this page */ }
    return next;
  });
  return [fold, set];
}

function RowLink({ x, selected, small = false }: { x: WsSub; selected: string | null; small?: boolean }) {
  const title = cleanTitle(x.text);
  return (
    <Link href={x.href} aria-current={selected === x.id ? "page" : undefined} title={title}
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-raised aria-[current=page]:bg-raised">
      <Hex tone={x.tone} className={small ? "size-1.5" : "size-2"} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate leading-5 ${small ? "text-xs text-ink/90" : "text-[13px] text-ink"}`}>{title}</span>
        <span className="block truncate text-xs leading-4 text-mute">{x.label} · {x.ago}</span>
      </span>
    </Link>
  );
}

function SessionItem({ x, selected, fold, setFold }: { x: WsTask; selected: string | null; fold: Record<string, boolean>; setFold: (id: string, open: boolean) => void }) {
  const t = useT();
  const subs = x.subs ?? [];
  if (subs.length === 0) return <li className="flex"><RowLink x={x} selected={selected} /></li>;
  const open = subs.some((s) => s.id === selected) || (fold[x.id] ?? false);
  return (
    <li>
      <div className="flex items-center">
        <button type="button" aria-expanded={open} aria-label={t(open ? "ws.foldSession" : "ws.unfoldSession", { n: subs.length })} onClick={() => setFold(x.id, !open)}
          className="flex size-6 shrink-0 items-center justify-center rounded text-faint transition hover:bg-raised hover:text-ink">
          <svg viewBox="0 0 24 24" aria-hidden="true" className={`size-3.5 transition ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <RowLink x={x} selected={selected} />
      </div>
      <ul hidden={!open} className="ml-3 border-l border-line pl-2">
        {subs.map((s) => <li key={s.id} className="flex"><RowLink x={s} selected={selected} small /></li>)}
      </ul>
    </li>
  );
}

export function TaskList({ tasks, selected }: { tasks: WsTask[]; selected: string | null }) {
  const t = useT();
  const [fold, setFold] = useFold();
  return (
    <nav aria-label={t("ws.tasks")} className="flex min-h-0 flex-col gap-1">
      {/* D-602: a quiet list like a product's sidebar — one line per conversation, its state under it */}
      <Link href="/" aria-current={selected === null ? "page" : undefined}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink transition hover:bg-raised aria-[current=page]:bg-raised">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-mute" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        {t("ws.new")}
      </Link>
      {tasks.length === 0 && <p className="px-2 pt-3 text-sm text-mute">{t("ws.noTasks")}</p>}
      {/* D-633: by project only; each project folds, and a conversation folds its sub-sessions */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {byProject(tasks).map((g) => {
          const key = `p:${g.id ?? "none"}`;
          const waiting = g.items.filter((x) => x.tone === "amber" || x.tone === "red").length;
          return (
            <details key={key} open={fold[key] ?? true} onToggle={(e) => { const o = e.currentTarget.open; if (o !== (fold[key] ?? true)) setFold(key, o); }} className="group/p pt-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-mute hover:text-ink [&::-webkit-details-marker]:hidden">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3 transition group-open/p:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                <span className="min-w-0 flex-1 truncate">{g.id === null ? t("ws.listNoProject") : g.name}</span>
                {waiting > 0 && <span className="tabular-nums text-warn" title={t("ws.projectWaiting", { n: waiting })}>{waiting}</span>}
                <span className="tabular-nums text-faint">{g.items.length}</span>
              </summary>
              <ul>{g.items.map((x) => <SessionItem key={x.id} x={x} selected={selected} fold={fold} setFold={setFold} />)}</ul>
            </details>
          );
        })}
      </div>
    </nav>
  );
}

// No scope to pick: a real agent works without limits ("free", D-360; the judge still runs), the demo agents'
// scenarios are bug fixes. The narrower types stay in the project's rules (.mandat.yml) and the CLI.
// D-384: the agent picker shows only agents that can run (lib/agents.ts agentChoices); one agent → just its name;
// none → a link to sign in instead of a box that cannot start anything. D-387: more than one project → a picker.
// D-531: "Ask first" (the default) talks before work; "Work right away" starts today's task at once (remembered).
const CHAT_ERRORS = { answering: "chat.err.answering", work_started: "chat.err.workStarted", nothing_to_do: "chat.err.nothingToDo", budget: "chat.budget", expired: "chat.expired", spec_not_ready: "chat.err.specNotReady", spec_changed: "chat.err.specChanged", already_approved: "chat.err.alreadyApproved", not_an_approver: "chat.err.notApprover", oracle_not_approved: "chat.err.oracleNotApproved", oracle_building: "chat.err.oracleBuilding", oracle_changed: "chat.err.oracleChanged", oracle_not_ready: "chat.err.oracleNotReady", job_not_sealed: "chat.err.jobNotSealed", seal_changed: "chat.err.sealChanged", job_not_delivered: "chat.err.jobNotDelivered", control_unavailable: "chat.err.controlUnavailable", not_local: "chat.err.notLocal" } as const;
const ENDED = ["budget", "expired"];
const PARKED = "harnova.parkedTask";

export function NewTask({ agents, preferredModel = null, projects: given, canAct, initialText = "", initialChat = null, home = null, localApproval = false }: { agents: WsAgent[]; preferredModel?: string | null; projects: { id: string; full_name: string }[]; canAct: boolean; initialText?: string; initialChat?: ConversationFeed | null; home?: HomeView | null; /** D-710: this computer approves by presence */ localApproval?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const chatAgent = initialChat?.conversation.agent;
  const [agent, setAgent] = useState(chatAgent && agents.some((a) => a.id === chatAgent) ? chatAgent : (agents[0]?.id ?? ""));
  // D-393: the remembered model of the default agent, else the agent's own default; changed per task here
  const [model, setModel] = useState<string | null>(initialChat?.conversation.model ?? preferredModel ?? agents[0]?.defaultModel ?? null);
  const current = agents.find((a) => a.id === agent);
  const pickAgent = (id: string) => {
    setAgent(id);
    setModel(agents.find((a) => a.id === id)?.defaultModel ?? null);
  };
  // D-626: a project added from the box is chosen at once; the page's list catches up on refresh
  const [added, setAdded] = useState<AddedProject | null>(null);
  const projects = withAdded(given, added);
  const [repo, setRepo] = useState(() => boxRepo(given, initialChat?.conversation.repo));
  const [adding, setAdding] = useState(false);
  const pickRepo = (v: string) => (v === NEW_PROJECT ? setAdding(true) : setRepo(v));
  const onAdded = (p: AddedProject) => {
    setAdded(p);
    setRepo(p.id);
    setAdding(false);
    setError(null);
    router.refresh();
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** D-611: the questions the person put off ("Later") — the seq of the asking turn */
  const [later, setLater] = useState<number | null>(null);
  const { chat, follow, reset } = useConversation(initialChat);
  // D-621: the box is one line and grows with its text up to 40% of the window, then scrolls
  const box = useRef<HTMLTextAreaElement>(null);
  // D-632: the box's real height (its chips wrap on a phone) lifts Nova above it (globals.css, --composer-h)
  const composer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = composer.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--composer-h", `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--composer-h");
    };
  }, []);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${composerHeight(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);
  const answering = chat !== null && isAnswering(chat.row.status);
  const pick = model && current?.models.includes(model) ? { model } : {};
  const fail = (r: { status: number; body: Record<string, unknown> }) => {
    setBusy(false);
    setError(errorText(t, r, CHAT_ERRORS, t("newTask.failed", { status: r.status })));
  };
  // D-600: no task on a project before its interview — the server refuses, and the interview opens here by itself; the
  // task waits (kept for this tab) and comes back to the box once the pop-up closes
  const interviewFirst = async (r: { status: number; body: Record<string, unknown> }, task: string): Promise<boolean> => {
    if (r.status !== 409 || r.body.error !== "project_interview_required" || typeof r.body.repo !== "string") return false;
    try { sessionStorage.setItem(PARKED, task); } catch { /* the task is still in the box */ }
    const i = await postJson("/api/conversations", { text: t("interview.kickoff", { task: task.slice(0, 300) }), agent, ...pick, repo: r.body.repo, purpose: "project" });
    if (i.status !== 201 || typeof i.body.id !== "string") return (fail(i), true);
    reset();
    setBusy(false);
    setError(null);
    window.history.replaceState(null, "", `/?chat=${i.body.id}`);
    follow(i.body.id);
    return true;
  };
  const send = async (said: string = text.trim()) => {
    const open = chat !== null && !ENDED.includes(chat.row.status) ? chat.row.id : undefined;
    const r = await postJson("/api/conversations", { text: said, agent, ...pick, ...(repo ? { repo } : {}), ...(open ? { conversation: open } : {}) });
    if (r.status !== 201 || typeof r.body.id !== "string") {
      if (!open && (await interviewFirst(r, said))) return;
      return fail(r);
    }
    if (!open) reset();
    setText("");
    setBusy(false);
    window.history.replaceState(null, "", `/?chat=${r.body.id}`);
    follow(r.body.id);
  };
  // D-600: a button of Harnova's first message opens a project's interview
  const meet = async (repoId: string) => {
    setBusy(true);
    setError(null);
    const i = await postJson("/api/conversations", { text: t("home.meetText"), agent, ...pick, repo: repoId, purpose: "project" });
    if (i.status !== 201 || typeof i.body.id !== "string") return fail(i);
    reset();
    setBusy(false);
    window.history.replaceState(null, "", `/?chat=${i.body.id}`);
    follow(i.body.id);
  };
  // D-600: the task parked for the interview comes back to an empty box
  useEffect(() => {
    if (initialChat || initialText) return;
    try {
      const parked = sessionStorage.getItem(PARKED);
      if (parked) {
        setText(parked);
        sessionStorage.removeItem(PARKED);
      }
    } catch { /* nothing parked */ }
  }, [initialChat, initialText]);
  const startWork = async () => {
    setError(null);
    // D-630: work starts only from a conversation (its goal and tests are agreed there first)
    if (!chat) return;
    setBusy(true);
    const r = await postJson(`/api/conversations/${chat.row.id}/start`, {});
    if (r.status === 201 && typeof r.body.id === "string") return router.push(`/?task=${r.body.id}`);
    // D-535: a job stays in the conversation: its card shows the plan, the units and the seal
    if (r.status === 201 && typeof r.body.job === "string") {
      setBusy(false);
      return follow(chat.row.id);
    }
    fail(r);
  };
  const retry = async () => {
    if (!chat) return;
    setBusy(true);
    const r = await postJson(`/api/conversations/${chat.row.id}/retry`, { agent, ...pick });
    if (r.status !== 200) return fail(r);
    setBusy(false);
    follow(chat.row.id);
  };
  // D-533: a person approves the spec they see (its hash); the feed then shows it approved
  const approve = async (hash: string) => {
    if (!chat) return;
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/conversations/${chat.row.id}/approve`, { spec_hash: hash });
    if (r.status !== 200) return fail(r);
    setBusy(false);
    follow(chat.row.id);
  };
  // D-534: a person builds the oracle of the approved spec, then approves the one they see (its hash)
  const oracleCall = async (url: string, body: Record<string, unknown>, okStatus: number) => {
    if (!chat) return;
    setBusy(true);
    setError(null);
    const r = await postJson(url, body);
    if (r.status !== okStatus) return fail(r);
    setBusy(false);
    follow(chat.row.id);
  };
  // D-540: "Bring into my folder" on the delivered job — the reply (done, or exactly why not) stays on the card
  const [brought, setBrought] = useState<BringReply | null>(null);
  const bring = async () => {
    if (!chat) return;
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/conversations/${chat.row.id}/job/bring`, {});
    if (r.status !== 200) return fail(r);
    const b = BringReply.safeParse(r.body.result);
    setBrought(b.success ? b.data : null);
    setBusy(false);
  };
  const fresh = () => {
    reset();
    window.history.replaceState(null, "", "/");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return setError(t("ws.ask"));
    setBusy(true);
    setError(null);
    return send();
  };
  if (!canAct) return <p className="m-auto text-sm text-mute">{t("newTask.onlyApprovers")}</p>;
  // A conversation needs no project (D-531): "hi" works on a fresh install. Work does.
  const cannotTalk = busy || answering || agents.length === 0;
  const blocked = cannotTalk || repo === "";
  const thread = chat !== null;
  // D-599: the interview of a whole project is a sheet over the app, the brief written live beside the conversation
  const interview = thread && chat.row.purpose === "project";
  // D-600: in the interview, the open questions are cards; the box comes back when nothing is asked
  const asked = thread && !answering ? openQuestions(chat.turns) : null;
  const questions = interview ? asked : null;
  // D-611: in a task conversation too, Harnova's questions open the same pop-up — one large question at a time, answers
  // to pick and Other; "Later" closes it and the box answers in words (the questions stay in the conversation)
  const popUp = !interview && asked !== null && later !== asked.seq ? asked : null;
  const form = (
    <form onSubmit={submit} className={interview ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3" : "flex min-h-0 w-full flex-1 flex-col gap-3"}>
      {questions && <InterviewStep key={questions.seq} questions={questions.questions} t={t} busy={busy} onSend={(said) => { setBusy(true); setError(null); void send(said); }} />}
      {popUp && (
        <div role="dialog" aria-modal="true" aria-label={t("ask.title")} className="fixed inset-0 z-30 flex items-center justify-center bg-scrim p-3 lg:p-8">
          <div className="flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-[16px] border border-line-strong bg-panel p-4 shadow-[0_30px_80px_rgb(0_0_0/0.5)] lg:p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="logo-mark inline-block size-5" />
              <p className="flex-1 text-sm font-medium">{t("ask.title")}</p>
              <button type="button" className={btn.ghost} onClick={() => setLater(popUp.seq)}>{t("ask.later")}</button>
            </div>
            <InterviewStep key={popUp.seq} questions={popUp.questions} t={t} busy={busy} onSend={(said) => { setBusy(true); setError(null); void send(said); }} />
          </div>
        </div>
      )}
      {thread ? (
        <ChatThread chat={chat} onRetry={() => void retry()} onNew={fresh} busy={busy} canApprove={canAct} onApprove={(h) => void approve(h)}
          onBuildOracle={(note) => void oracleCall(`/api/conversations/${chat.row.id}/oracle`, note ? { note } : {}, 201)} onApproveOracle={(h) => void oracleCall(`/api/conversations/${chat.row.id}/oracle/approve`, { oracle_hash: h }, 200)}
          onApproveJob={(h, code) => void oracleCall(`/api/conversations/${chat.row.id}/job/approve`, { seal_hash: h, ...(code ? { code } : {}) }, 200)}
          onBring={() => void bring()} brought={brought} localApproval={localApproval} />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          {home ? <HomeDashboard home={home} onMeet={(r) => void meet(r)} busy={busy} /> : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10">
              <h1 className="text-center font-display text-3xl font-semibold tracking-tight">{t("ws.ask")}</h1>
              <p className="text-center text-sm text-mute">{t("chat.askFirstHint")}</p>
            </div>
          )}
        </div>
      )}
      {!interview && asked !== null && later === asked.seq && (
        <button type="button" className={`${btn.secondary} self-center`} onClick={() => setLater(null)}>{t("ask.reopen", { n: asked.questions.length })}</button>
      )}
      {/* D-621: the box sits at the bottom like in any chat — one line that grows with the text; the mode, the agent,
          the model and the project are small chips in its bar, the send button is round */}
      <div ref={composer} data-composer className={`sticky bottom-0 z-10 mx-auto w-full max-w-3xl bg-canvas pb-3 ${questions ? "hidden" : ""}`}>
        <div className="rounded-[18px] border border-line-strong bg-panel shadow-[0_10px_30px_rgb(0_0_0/0.22)] transition focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-soft),0_10px_30px_rgb(0_0_0/0.22)]">
          <textarea ref={box} data-voice="prompt" value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={1} maxLength={4000} aria-label={t("newTask.what")} placeholder={t("chat.placeholder")} autoFocus
            onKeyDown={(e) => { if (sendsOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            className="block max-h-[40vh] w-full resize-none overflow-y-auto bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-faint" />
          <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1">
            {agents.length > 1 ? (
              <Select size="sm" aria-label={t("ws.agent")} value={agent} onChange={pickAgent} options={agents.map((a) => ({ value: a.id, label: a.limitedUntil ? `${a.label} · ${t("agent.limited", { when: whenShort(a.limitedUntil, t.lang) })}` : a.label }))} />
            ) : agents[0] ? (
              <span className="px-1.5 text-xs text-mute">{agents[0].label}</span>
            ) : (
              <Link href="/welcome" className="px-1.5 text-xs text-accent-text underline-offset-4 hover:underline">{t("ws.signIn")}</Link>
            )}
            {current && current.models.length > 1 && (
              <Select size="sm" mono aria-label={t("ws.model")} value={model ?? ""} onChange={setModel} options={current.models.map((m) => ({ value: m, label: m }))} />
            )}
            {current && current.models.length === 1 && <span className="px-1.5 font-mono text-xs text-mute">{current.models[0]}</span>}
            {/* D-626: always a menu — the projects, No project, + New project (added right here, then chosen); an open
                conversation keeps the project it started with */}
            {!interview && (
              <Select size="sm" mono aria-label={t("newTask.repo")} value={repo} onChange={pickRepo} disabled={thread}
                options={projectChoices(projects, { none: t("newTask.noProject"), add: t("newTask.newProject") })} />
            )}
            <span className="ml-auto flex items-center gap-1.5">
              {thread && canStartWork(chat.row, chat.job ?? null) && <button type="button" className={`${btn.secondary} rounded-full px-3 py-1.5 text-xs`} onClick={() => void startWork()} disabled={blocked}>{t("chat.start")}</button>}
              <Tip side="top-end" label={busy ? t("chat.sending") : t("chat.send")} hint={t("composer.keys")}>
                <button type="submit" disabled={cannotTalk || text.trim() === ""} aria-label={busy ? t("chat.sending") : t("chat.send")}
                  className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] transition hover:brightness-110 disabled:bg-raised disabled:text-faint disabled:shadow-none">
                  {busy ? <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  )}
                </button>
              </Tip>
            </span>
          </div>
        </div>
        {error && <p role="alert" className="mt-2 text-center text-sm text-bad">{error}</p>}
      </div>
    </form>
  );
  // D-626: "Add project" over the app, outside the box's form (its own forms cannot nest in it)
  const sheet = adding && (
    <div role="dialog" aria-modal="true" aria-label={t("add.title")} className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-scrim p-3 lg:p-8"
      onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}>
      <div className="w-full max-w-3xl rounded-[16px] border border-line-strong bg-panel p-4 shadow-[0_30px_80px_rgb(0_0_0/0.5)] lg:p-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="logo-mark inline-block size-5" />
          <p className="flex-1 text-sm font-medium">{t("add.title")}</p>
          <button type="button" className={btn.ghost} onClick={() => setAdding(false)}>{t("interview.close")}</button>
        </div>
        <p className="mt-1 text-sm text-mute">{t("newTask.addHint")}</p>
        <AddProject initialPath={null} onAdded={onAdded} />
      </div>
    </div>
  );
  if (!interview) return <AgentNames agents={agents}>{form}{sheet}</AgentNames>;
  return (
    <AgentNames agents={agents}>
    <div role="dialog" aria-modal="true" aria-label={t("interview.title")} className="fixed inset-0 z-30 flex items-stretch justify-center bg-scrim p-3 lg:p-8">
      <div className="flex w-full max-w-6xl flex-col overflow-hidden rounded-[16px] border border-line-strong bg-panel shadow-[0_30px_80px_rgb(0_0_0/0.5)]">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <span aria-hidden="true" className="logo-mark inline-block size-6" />
          <p className="flex-1 text-[15px] font-semibold">{t("interview.title")}</p>
          <Link href="/" className={btn.ghost}>{t("interview.close")}</Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 p-4 lg:flex-row lg:p-5">
          {form}
          <ProjectProfile turns={chat.turns} t={t} />
        </div>
      </div>
    </div>
    </AgentNames>
  );
}

/** D-619: the start is a small dashboard — Harnova's line and its next step, four tiles (what waits for you, what runs,
 * what is done, the projects) and the first rows of what needs you and of what runs now. The numbers are the list's own. */
function HomeDashboard({ home, onMeet, busy }: { home: HomeView; onMeet: (repo: string) => void; busy: boolean }) {
  const t = useT();
  const { counts, waiting, running } = home.queue;
  const total = counts.waiting + counts.running + counts.done;
  const firstRunning = running[0]?.href ?? null;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const tile = (o: { n: number; label: string; sub: string; tone: string; bar: string; shape: string; href: string | null; fill: number }) => {
    const body = (
      <>
        <span className="flex items-center justify-between">
          <span className="text-xs font-medium text-mute">{o.label}</span>
          <span aria-hidden="true" className={`${o.shape} inline-block size-2.5 ${o.n > 0 ? o.bar : "bg-line-strong"}`} />
        </span>
        <span className={`mt-1.5 block text-[28px] font-semibold leading-none tabular-nums ${o.n > 0 ? o.tone : "text-ink"}`}>{o.n}</span>
        <span className="mt-1.5 block truncate text-xs text-faint">{o.sub}</span>
        <span aria-hidden="true" className="mt-3 block h-1 overflow-hidden rounded-full bg-raised">
          <span className={`block h-full rounded-full ${o.bar} transition-[width] duration-700`} style={{ width: `${o.fill}%` }} />
        </span>
      </>
    );
    const cls = "group rounded-[14px] border border-line bg-panel p-3.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.15)] transition duration-200";
    return o.href ? <Link href={o.href} className={`${cls} hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_24px_rgb(0_0_0/0.25)]`}>{body}</Link> : <div className={cls}>{body}</div>;
  };
  const share = (n: number) => t("home.tile.share", { n, of: total });
  const row = (x: WsTask, live: boolean) => (
    <li key={x.id}>
      <Link href={x.href} className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition hover:bg-raised">
        {live ? <span aria-hidden="true" className="relative flex size-2.5 shrink-0"><span className="absolute inset-0 animate-ping rounded-full bg-info opacity-40" /><span className="relative size-2.5 rounded-full bg-info" /></span> : <Hex tone={x.tone} className="size-2.5" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{cleanTitle(x.text)}</span>
          <span className="block truncate text-xs text-mute">{x.label} · {x.ago}</span>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </Link>
    </li>
  );
  const interviews = home.actions.filter((a) => a.kind === "interview");
  // D-709: a finished job waiting for review is the next step, before any interview
  const review = home.actions.find((a) => a.kind === "link" && a.label.key === "home.act.review");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-6 pt-2">
      <header className="flex items-start gap-3">
        <span aria-hidden="true" className="logo-mark mt-1 inline-block size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">{t("home.dash.title")}</h1>
          <p className="mt-0.5 text-sm leading-relaxed text-mute">{t(home.say.key, home.say.params)}</p>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile({ n: counts.waiting, label: t("home.tile.waiting"), sub: share(counts.waiting), tone: "text-warn", bar: "bg-warn", shape: "sig-diamond", href: waiting[0]?.href ?? null, fill: pct(counts.waiting) })}
        {tile({ n: counts.running, label: t("home.tile.running"), sub: share(counts.running), tone: "text-info", bar: "bg-info", shape: "rounded-full", href: firstRunning, fill: pct(counts.running) })}
        {tile({ n: counts.done, label: t("home.tile.done"), sub: share(counts.done), tone: "text-ok", bar: "bg-ok", shape: "rounded-full", href: null, fill: pct(counts.done) })}
        {tile({ n: home.stats.projects, label: t("home.tile.projects"), sub: home.stats.noBrief > 0 ? t("home.tile.noBrief", { n: home.stats.noBrief }) : t("home.tile.allBriefs"), tone: "text-ink", bar: home.stats.noBrief > 0 ? "bg-warn" : "bg-accent", shape: "rounded-[3px]", href: "/harness", fill: home.stats.projects > 0 ? Math.round(((home.stats.projects - home.stats.noBrief) / home.stats.projects) * 100) : 0 })}
      </div>
      {(review || interviews.length > 0) && (
        <section aria-label={t("home.next")} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-warn/40 bg-warn-soft px-4 py-3">
          <Hex tone="amber" className="size-3" />
          <p className="min-w-0 flex-1 text-sm"><span className="font-medium text-warn">{t("home.next")}</span></p>
          {review?.kind === "link" && <Link href={review.href} className={`${btn.primary} rounded-full py-1.5`}>{t(review.label.key, review.label.params)}</Link>}
          {interviews.map((a) => a.kind === "interview" && (
            <button key={a.repo} type="button" disabled={busy} onClick={() => onMeet(a.repo)} className={`${review ? btn.secondary : btn.primary} rounded-full py-1.5`}>{t(a.label.key, a.label.params)}</button>
          ))}
        </section>
      )}
      {/* D-631: one column that may shrink below its titles on a phone; two side by side from tablet width */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-label={t("home.queue.waiting")} className="rounded-[14px] border border-line bg-panel p-1.5">
          <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-medium text-warn">{t("home.queue.waiting")}<span className="tabular-nums text-faint">{counts.waiting}</span></p>
          {waiting.length > 0 ? <ul>{waiting.map((x) => row(x, false))}</ul> : <p className="px-3 pb-3 pt-1 text-sm text-mute">{t("home.queue.calm")}</p>}
          {counts.waiting > waiting.length && <p className="px-3 pb-2 pt-1 text-xs text-faint">{t("home.queue.more", { n: counts.waiting - waiting.length })}</p>}
        </section>
        <section aria-label={t("home.queue.running")} className="rounded-[14px] border border-line bg-panel p-1.5">
          <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-medium text-info">{t("home.queue.running")}<span className="tabular-nums text-faint">{counts.running}</span></p>
          {running.length > 0 && <ul>{running.map((x) => row(x, true))}</ul>}
        </section>
      </div>
    </div>
  );
}
