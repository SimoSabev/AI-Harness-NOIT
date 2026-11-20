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
import { conversationFeed } from "../lib/server/conversation";
import { sessionOf } from "../lib/server/workbench";
import { taskProjects } from "../lib/projects";
import { taskTitle } from "../lib/task-title";
import { foldJobs } from "../lib/task-list";
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
  const [b, projects, initial, d, sess, twin, chat] = await Promise.all([
    board(db(), c.uid, c.org),
    repos(db(), c.uid, c.org),
    selected ? taskFeed(db(), c.uid, c.org, selected, -1) : null,
    selected ? taskDetail(db(), c.uid, c.org, c.role, selected) : null,
    selected ? sessionOf(db(), c.uid, c.org, selected) : null,
    selected ? twinView(db(), c.uid, c.org, selected) : null,
    chatId ? conversationFeed(db(), c.uid, c.org, chatId, -1) : null,
  ]);
  const now = new Date();
  const rows = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1));
  // D-554: a job's oracle, units and final check are one row that opens its conversation
  const tasks = foldJobs(rows).slice(0, 100).map((it) => {
    const x = it.kind === "job" ? it.newest : it.row;
    const s = statusOf(x, t.lang);
    const job = it.kind === "job";
    const merged = it.kind === "job" && it.merged;
    return { id: job ? it.conversation_id : x.id, href: job ? `/?chat=${it.conversation_id}` : `/?task=${x.id}`,
      text: job && x.spec_goal ? x.spec_goal : taskTitle(x, t), tone: merged ? "green" as const : s.tone, label: merged ? t("task.job.merged") : s.label, ago: ago(x.updated_at, now, t.lang) };
  });
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
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="min-h-0 lg:border-r lg:border-line lg:pr-4">
          <TaskList tasks={tasks} selected={initial ? selected : chatId} />
        </div>
        <div className="flex min-h-0 flex-col">
          {initial && d && sess ? (
            <LiveTask key={selected} id={selected as string} initial={initial} canAct={canAct(c.role)} agentName={agentLabel(initial.task.agent, t.lang)}
              view={{ evidence: d.evidence, diff: c.role === "viewer" ? null : d.diff, diffOmitted: c.role === "viewer" ? null : d.diffOmitted, asks: d.asks, repoId: d.task.repo_id, twin }}
              shots={<TaskShots d={d} />} details={<TaskDetails d={d} sess={sess} />} />
          ) : (
            <NewTask key={chatId ?? "new"} agents={agents} preferredModel={preferredModel} projects={taskProjects(projects, process.env.MANDAT_DEMO_AGENTS === "1")} canAct={canAct(c.role)} initialText={prefill} taskMode={taskMode} initialChat={showChat(chat)} />
          )}
        </div>
      </div>
    </Shell>
  );
}
