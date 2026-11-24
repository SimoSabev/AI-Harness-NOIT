"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import type { Tone } from "../lib/status";
import { Hex, btn } from "./ui";
import { Select } from "./select";
import { ChatThread, useConversation } from "./conversation";
import { ProjectProfile } from "./project-profile";
import { InterviewStep } from "./interview-step";
import { openQuestions } from "../lib/interview";
import { taskTypeFor } from "../lib/agents";
import { boxRepo, sendsOnEnter } from "../lib/chat";
import { isAnswering } from "../lib/conversation-types";
import type { ConversationFeed } from "../lib/conversation-types";
import { BringReply } from "@mandat/contract";
import type { HomeBrief } from "../lib/home";

type TaskMode = "ask_first" | "work_now";

// The workspace's left column (the tasks, like the chats of an assistant) and the empty state: one box to start a task.
export interface WsTask { id: string; href: string; text: string; tone: Tone; label: string; ago: string }
/** D-393: an agent of the task box with the models it can use (lib/agents.ts taskAgents) */
export interface WsAgent { id: string; label: string; models: string[]; defaultModel: string | null }

export function TaskList({ tasks, selected }: { tasks: WsTask[]; selected: string | null }) {
  const t = useT();
  return (
    <nav aria-label={t("ws.tasks")} className="flex min-h-0 flex-col gap-2">
      <Link href="/" className={`${btn.secondary} justify-start`} aria-current={selected === null ? "page" : undefined}>+ {t("ws.new")}</Link>
      <p className="px-2 pt-2 font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">{t("ws.tasks")}</p>
      {tasks.length === 0 && <p className="px-2 text-sm text-mute">{t("ws.noTasks")}</p>}
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {tasks.map((x) => (
          <li key={x.id}>
            <Link href={x.href} aria-current={selected === x.id ? "page" : undefined}
              className="flex items-start gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-raised aria-[current=page]:bg-accent-soft">
              <Hex tone={x.tone} className="mt-1.5 h-2 w-2.5" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2">{x.text}</span>
                <span className="block text-[11px] text-mute">{x.label} · {x.ago}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
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

export function NewTask({ agents, preferredModel = null, projects, canAct, initialText = "", taskMode = "ask_first", initialChat = null, home = null }: { agents: WsAgent[]; preferredModel?: string | null; projects: { id: string; full_name: string }[]; canAct: boolean; initialText?: string; taskMode?: TaskMode; initialChat?: ConversationFeed | null; home?: HomeBrief | null }) {
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
  const [repo, setRepo] = useState(() => boxRepo(projects, initialChat?.conversation.repo));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TaskMode>(taskMode);
  const { chat, follow, reset } = useConversation(initialChat);
  const asking = mode === "ask_first";
  const answering = chat !== null && isAnswering(chat.row.status);
  const pick = model && current?.models.includes(model) ? { model } : {};
  const fail = (r: { status: number; body: Record<string, unknown> }) => {
    setBusy(false);
    setError(errorText(t, r, CHAT_ERRORS, t("newTask.failed", { status: r.status })));
  };
  const pickMode = (m: TaskMode) => {
    setMode(m);
    setError(null);
    // remembered by `mandat local`; elsewhere the choice lasts for this page
    void postJson("/api/preferences", { taskMode: m }, "PUT").catch(() => undefined);
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
  const workNow = async () => {
    const r = await postJson("/api/tasks", { text: text.trim(), type: taskTypeFor(agent), agent, ...pick, ...(repo ? { repo } : {}) });
    if (r.status === 201 && typeof r.body.id === "string") return router.push(`/?task=${r.body.id}`);
    if (await interviewFirst(r, text.trim())) return;
    fail(r);
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
    if (!chat) {
      if (text.trim() === "") return setError(t("ws.ask"));
      setBusy(true);
      return workNow();
    }
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
    return asking ? send() : workNow();
  };
  if (!canAct) return <p className="m-auto text-sm text-mute">{t("newTask.onlyApprovers")}</p>;
  // A conversation needs no project (D-531): "hi" works on a fresh install. Work does.
  const cannotTalk = busy || answering || agents.length === 0;
  const blocked = cannotTalk || projects.length === 0;
  const sendBlocked = asking ? cannotTalk : blocked;
  const modes = (
    <div role="group" aria-label={t("chat.mode")} className="mx-auto inline-flex rounded-lg border border-line-strong bg-panel p-0.5 text-xs">
      {(["ask_first", "work_now"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => pickMode(m)}
          className="rounded-md px-3 py-1.5 font-medium text-mute transition hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-ink">
          {t(m === "ask_first" ? "chat.askFirst" : "chat.workNow")}
        </button>
      ))}
    </div>
  );
  const thread = asking && chat !== null;
  // D-599: the interview of a whole project is a sheet over the app, the brief written live beside the conversation
  const interview = thread && chat.row.purpose === "project";
  // D-600: in the interview, the open questions are cards; the box comes back when nothing is asked
  const questions = interview && !answering ? openQuestions(chat.turns) : null;
  const form = (
    <form onSubmit={submit} className={interview ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3" : thread ? "flex min-h-0 w-full flex-1 flex-col gap-3 pb-4" : "m-auto flex w-full max-w-2xl flex-col gap-4 py-10"}>
      {questions && <InterviewStep key={questions.seq} questions={questions.questions} t={t} busy={busy} onSend={(said) => { setBusy(true); setError(null); void send(said); }} />}
      {thread ? (
        <ChatThread chat={chat} onRetry={() => void retry()} onNew={fresh} busy={busy} canApprove={canAct} onApprove={(h) => void approve(h)}
          onBuildOracle={(note) => void oracleCall(`/api/conversations/${chat.row.id}/oracle`, note ? { note } : {}, 201)} onApproveOracle={(h) => void oracleCall(`/api/conversations/${chat.row.id}/oracle/approve`, { oracle_hash: h }, 200)}
          onApproveJob={(h, code) => void oracleCall(`/api/conversations/${chat.row.id}/job/approve`, { seal_hash: h, ...(code ? { code } : {}) }, 200)}
          onBring={() => void bring()} brought={brought} />
      ) : (
        home ? <HomeIntro home={home} onMeet={(r) => void meet(r)} busy={busy} /> : (
          <>
            <h1 className="text-center font-display text-3xl font-semibold tracking-tight">{t("ws.ask")}</h1>
            <p className="text-center text-sm text-mute">{t(asking ? "chat.askFirstHint" : "ws.askHint")}</p>
          </>
        )
      )}
      {!interview && modes}
      <div className={`rounded-2xl border border-line-strong bg-panel p-3 focus-within:border-accent-text ${questions ? "hidden" : ""}`}>
        <textarea data-voice="prompt" value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={thread ? 2 : 4} maxLength={4000} aria-label={t("newTask.what")} placeholder={t(asking ? "chat.placeholder" : "ws.placeholder")} autoFocus
          onKeyDown={(e) => { if (sendsOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          className="w-full resize-none bg-transparent px-1 text-[15px] outline-none placeholder:text-mute" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {agents.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-mute">
              {t("ws.agent")}
              <Select size="sm" aria-label={t("ws.agent")} value={agent} onChange={pickAgent} options={agents.map((a) => ({ value: a.id, label: a.label }))} />
            </label>
          ) : agents[0] ? (
            <span className="text-xs text-mute">{t("ws.agent")} <span className="text-ink">{agents[0].label}</span></span>
          ) : (
            <Link href="/welcome" className="text-sm text-accent underline-offset-4 hover:underline">{t("ws.signIn")}</Link>
          )}
          {current && current.models.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-mute">
              {t("ws.model")}
              <Select size="sm" mono aria-label={t("ws.model")} value={model ?? ""} onChange={setModel} options={current.models.map((m) => ({ value: m, label: m }))} />
            </label>
          )}
          {current && current.models.length === 1 && <span className="font-mono text-xs text-mute">{current.models[0]}</span>}
          <span className="ml-auto flex items-center gap-2">
            {asking && <button type="button" className={btn.secondary} onClick={() => void startWork()} disabled={blocked}>{t("chat.start")}</button>}
            <button type="submit" className={btn.primary} disabled={sendBlocked}>{busy ? t(asking ? "chat.sending" : "ws.sending") : t(asking ? "chat.send" : "ws.send")}</button>
          </span>
        </div>
      </div>
      {projects.length > 1 ? (
        <label className="mx-auto flex items-center gap-1.5 text-xs text-mute">
          {t("newTask.repo")}
          <Select size="sm" mono aria-label={t("newTask.repo")} value={repo} onChange={setRepo} options={projects.map((p) => ({ value: p.id, label: p.full_name }))} />
        </label>
      ) : projects[0] ? (
        <p className="text-center text-xs text-mute">{t("newTask.repo")} <span className="font-mono">{projects[0].full_name}</span></p>
      ) : (
        <p className="text-center text-sm text-mute">{t("ws.noProject")} <Link href="/projects/add" className="text-accent underline-offset-4 hover:underline">{t("add.title")}</Link></p>
      )}
      {error && <p role="alert" className="text-center text-sm text-bad">{error}</p>}
    </form>
  );
  if (!interview) return form;
  return (
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
  );
}

/** D-600: the start is a conversation with Harnova — the numbers that matter, then its first message with buttons */
function HomeIntro({ home, onMeet, busy }: { home: HomeBrief; onMeet: (repo: string) => void; busy: boolean }) {
  const t = useT();
  const stat = (n: number, label: string, tone: string) => (
    <div className="rounded-[10px] border border-line bg-panel px-4 py-3">
      <p className={`font-mono text-2xl ${tone}`}>{n}</p>
      <p className="text-xs text-mute">{label}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(home.stats.waiting, t("home.stat.waiting"), home.stats.waiting > 0 ? "text-warn" : "text-ink")}
        {stat(home.stats.running, t("home.stat.running"), home.stats.running > 0 ? "text-info" : "text-ink")}
        {stat(home.stats.projects, t("home.stat.projects"), "text-ink")}
        {stat(home.stats.noBrief, t("home.stat.noBrief"), home.stats.noBrief > 0 ? "text-warn" : "text-ok")}
      </div>
      <div className="flex gap-3 rounded-[14px] border border-line bg-panel p-4">
        <span aria-hidden="true" className="logo-mark mt-0.5 inline-block size-6 shrink-0" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[11px] font-medium text-mute">{t("home.harnova")}</p>
          <p className="text-[15px] leading-relaxed">{t(home.say.key, home.say.params)}</p>
          {home.actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {home.actions.map((a, i) => a.kind === "interview" ? (
                <button key={a.repo} type="button" disabled={busy} onClick={() => onMeet(a.repo)} className={i === 0 ? btn.primary : btn.secondary}>{t(a.label.key, a.label.params)}</button>
              ) : (
                <Link key={a.href} href={a.href} className={i === 0 ? btn.primary : btn.secondary}>{t(a.label.key, a.label.params)}</Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
