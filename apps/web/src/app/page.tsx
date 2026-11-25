import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveTask } from "../components/live-task";
import { TaskDetails, TaskShots } from "../components/task-details";
import { Shell } from "../components/shell";
import { NewTask, TaskList } from "../components/workspace";

import { getT } from "../i18n/server";
import { agentLabel } from "../lib/agents";
import type { TaskAgent } from "../lib/agents";
import { pageTitle } from "../lib/inbox";
import { ago, statusOf } from "../lib/status";
import { taskFeed } from "../lib/server/chat-feed";
import { db } from "../lib/server/db";
import { agentsView } from "../lib/server/connections";
import { canAct, pageCtx } from "../lib/server/page";
import { board, repos, taskDetail } from "../lib/server/queries";
import { twinView } from "../lib/server/twin";
import { conversationFeed, openConversations, projectBriefs } from "../lib/server/conversation";
import { homeBrief } from "../lib/home";
import { sessionOf } from "../lib/server/workbench";
import { taskProjects } from "../lib/projects";
import { taskTitle } from "../lib/task-title";
import { foldJobs, mergeByTime, openConversationsToList } from "../lib/task-list";
import { showChat } from "../lib/chat";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [c, t] = await Promise.all([pageCtx(), getT()]);
  return { title: pageTitle(c.waiting, t.lang) };
}

// The workspace (chat-first start page): the tasks on the left like conversations; the chosen one in the middle — the one
// page of a task (D-386: /tasks/:id redirects here); no task chosen → one box to start a new one. The overview is at /overview.
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ task?: string | string[]; text?: string | string[]; chat?: string | string[] }> }) {
  const c = await pageCtx();
  const t = await getT();
  const sp = await searchParams;
  const q = sp.task;
  // E9a: "Make a task" from a night question prefills the text (it used to open /tasks/new, D-384)
  const prefill = typeof sp.text === "string" ? sp.text.slice(0, 4000) : "";
  const selected = typeof q === "string" && /^t_[a-z0-9_]{1,40}$/.test(q) ? q : null;
  // D-531: the open conversation of "Ask first" (?chat=c_…) survives a reload
  const chatId = !selected && typeof sp.chat === "string" && /^c_[a-z0-9_]{1,40}$/.test(sp.chat) ? sp.chat : null;
  const [b, projects, initial, d, sess, twin, chat, convs, briefs] = await Promise.all([
    board(db(), c.uid, c.org),
    repos(db(), c.uid, c.org),
    selected ? taskFeed(db(), c.uid, c.org, selected, -1) : null,
    selected ? taskDetail(db(), c.uid, c.org, c.role, selected) : null,
    selected ? sessionOf(db(), c.uid, c.org, selected) : null,
    selected ? twinView(db(), c.uid, c.org, selected) : null,
    chatId ? conversationFeed(db(), c.uid, c.org, chatId, -1) : null,
    openConversations(db(), c.uid, c.org),
    projectBriefs(db(), c.org),
  ]);
  const now = new Date();
  const rows = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1));
  // D-554: a job's oracle, units and final check are one row that opens its conversation
  const folded = foldJobs(rows);
  const taskRows = folded.slice(0, 100).map((it) => {
    const x = it.kind === "job" ? it.newest : it.row;
    const s = statusOf(x, t.lang);
    const job = it.kind === "job";
    const merged = it.kind === "job" && it.merged;
    return { id: job ? it.conversation_id : x.id, href: job ? `/?chat=${it.conversation_id}` : `/?task=${x.id}`,
      text: job && x.spec_goal ? x.spec_goal : taskTitle(x, t), tone: merged ? "green" as const : s.tone, label: merged ? t("task.job.merged") : s.label, ago: ago(x.updated_at, now, t.lang), at: x.updated_at };
  });
  // D-583: "Ask first" conversations that are not a task or a job yet are listed too, so they are not lost after leaving them
  const shownJobs = new Set(folded.flatMap((it) => (it.kind === "job" ? [it.conversation_id] : [])));
  const convRows = openConversationsToList(convs, shownJobs).map((v) => ({
    id: v.id, href: `/?chat=${v.id}`, text: v.text || t("task.conv.untitled"),
    tone: v.status === "idle" ? "amber" as const : "blue" as const,
    label: v.purpose === "project" ? t("task.conv.project") : v.status === "idle" ? t("task.conv.waiting") : t("task.conv.answering"),
    ago: ago(v.updated_at, now, t.lang), at: v.updated_at,
  }));
  const tasks = mergeByTime(taskRows, convRows).slice(0, 100).map(({ at: _at, ...rest }) => rest);
  // D-600: the start is a conversation with Harnova: the numbers on top and its first message with buttons
  const home = homeBrief({ waiting: c.waiting ?? 0, running: tasks.filter((x) => x.tone === "blue").length, projects: briefs, firstWaiting: tasks.find((x) => x.tone === "amber")?.href ?? null });
  // D-393: the remembered default first; nothing can run yet and the first-run page was never finished → open it
  let agents: TaskAgent[] = [];
  let preferredModel: string | null = null;
  let taskMode: "ask_first" | "work_now" = "ask_first";
  if (!initial) {
    const v = await agentsView(t.lang);
    if (v.local && v.agents.length === 0 && !v.prefs.onboarded) redirect("/welcome");
    agents = v.agents;
    taskMode = v.prefs.taskMode;
    preferredModel = v.prefs.defaultAgent === agents[0]?.id ? v.prefs.defaultModel : null;
  }
  return (
    <Shell current="tasks" waiting={c.waiting} full>
      {/* D-602: the conversations are a column from tablet width up; on a phone they fold above the work */}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(200px,248px)_minmax(0,1fr)] md:gap-6">
        <details className="rounded-[10px] border border-line bg-panel px-3 py-2 md:hidden">
          <summary className="cursor-pointer text-sm font-medium">{t("ws.tasks")} · {tasks.length}</summary>
          <div className="mt-2 max-h-[50vh] overflow-y-auto"><TaskList tasks={tasks} selected={initial ? selected : chatId} /></div>
        </details>
        <div className="hidden min-h-0 md:block md:border-r md:border-line md:pr-3">
          <TaskList tasks={tasks} selected={initial ? selected : chatId} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          {initial && d && sess ? (
            <LiveTask key={selected} id={selected as string} initial={initial} canAct={canAct(c.role)} agentName={agentLabel(initial.task.agent, t.lang)}
              view={{ evidence: d.evidence, diff: c.role === "viewer" ? null : d.diff, diffOmitted: c.role === "viewer" ? null : d.diffOmitted, asks: d.asks, repoId: d.task.repo_id, twin }}
              shots={<TaskShots d={d} />} details={<TaskDetails d={d} sess={sess} />} />
          ) : (
            <NewTask key={chatId ?? "new"} agents={agents} preferredModel={preferredModel} projects={taskProjects(projects, process.env.MANDAT_DEMO_AGENTS === "1")} canAct={canAct(c.role)} initialText={prefill} taskMode={taskMode} initialChat={showChat(chat)} home={home} />
          )}
        </div>
      </div>
    </Shell>
  );
}
