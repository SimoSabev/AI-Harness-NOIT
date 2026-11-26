import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveTask } from "../components/live-task";
import { TaskDetails, TaskShots } from "../components/task-details";
import { Shell } from "../components/shell";
import { NewTask, TaskList } from "../components/workspace";
import { SidePane } from "../components/side-pane";
import { cookies } from "next/headers";
import { SIDE_COOKIE, parseSide } from "../lib/side-pane";

import { getT } from "../i18n/server";
import { agentLabel, switchTargets } from "../lib/agents";
import type { TaskAgent } from "../lib/agents";
import { pageTitle } from "../lib/inbox";
import { taskFeed } from "../lib/server/chat-feed";
import { db } from "../lib/server/db";
import { agentsView } from "../lib/server/connections";
import { canAct, pageCtx, requestList } from "../lib/server/page";
import { repos, taskDetail } from "../lib/server/queries";
import { twinView } from "../lib/server/twin";
import { accountLimits, conversationFeed, projectBriefs } from "../lib/server/conversation";
import { homeBrief, homeQueue } from "../lib/home";
import { sessionOf } from "../lib/server/workbench";
import { taskProjects } from "../lib/projects";
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
  const [projects, initial, d, sess, twin, chat, briefs] = await Promise.all([
    repos(db(), c.uid, c.org),
    selected ? taskFeed(db(), c.uid, c.org, selected, -1) : null,
    selected ? taskDetail(db(), c.uid, c.org, c.role, selected) : null,
    selected ? sessionOf(db(), c.uid, c.org, selected) : null,
    selected ? twinView(db(), c.uid, c.org, selected) : null,
    chatId ? conversationFeed(db(), c.uid, c.org, chatId, -1) : null,
    projectBriefs(db(), c.org),
  ]);
  // D-624: the list is built once per request; the frame's badge counts its waiting rows
  const tasks = await requestList(c.uid, c.org, t.lang);
  // D-619: the dashboard counts the list's own groups, so its numbers are the ones the side bar shows
  const queue = homeQueue(tasks);
  const home = { ...homeBrief({ waiting: queue.counts.waiting, running: queue.counts.running, projects: briefs, firstWaiting: queue.waiting[0]?.href ?? null }), queue };
  const side = parseSide((await cookies()).get(SIDE_COOKIE)?.value);
  // D-393: the remembered default first; nothing can run yet and the first-run page was never finished → open it
  let agents: TaskAgent[] = [];
  let preferredModel: string | null = null;
  if (!initial) {
    // D-612: which accounts are out of their subscription limit, so the box and the conversation say it
    const v = await agentsView(t.lang, process.env, await accountLimits(db(), c.org));
    if (v.local && v.agents.length === 0 && !v.prefs.onboarded) redirect("/welcome");
    agents = v.agents;
    preferredModel = v.prefs.defaultAgent === agents[0]?.id ? v.prefs.defaultModel : null;
  }
  // D-628: a task its subscription's limit holds can go on now with an account that is not in its own limit
  const held = initial?.task.state === "HELD" && initial.task.wait_reason === "channel_limit" ? initial.task.agent : null;
  const switchTo = held ? switchTargets((await agentsView(t.lang, process.env, await accountLimits(db(), c.org))).agents, held).map((a) => ({ id: a.id, label: a.label })) : [];
  return (
    <Shell current="tasks" waiting={c.waiting} full>
      {/* D-602: the conversations are a column from tablet width up; on a phone they fold above the work */}
      {/* D-620: the list folds away and is as wide as the person drags it */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-0">
        <details className="rounded-[10px] border border-line bg-panel px-3 py-2 md:hidden">
          <summary className="cursor-pointer text-sm font-medium">{t("ws.tasks")} · {tasks.length}</summary>
          <div className="mt-2 max-h-[50vh] overflow-y-auto"><TaskList tasks={tasks} selected={initial ? selected : chatId} /></div>
        </details>
        <SidePane initial={side} waiting={queue.counts.waiting}>
          <TaskList tasks={tasks} selected={initial ? selected : chatId} />
        </SidePane>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-6">
          {initial && d && sess ? (
            <LiveTask key={selected} id={selected as string} initial={initial} canAct={canAct(c.role)} agentName={agentLabel(initial.task.agent, t.lang)}
              view={{ evidence: d.evidence, diff: c.role === "viewer" ? null : d.diff, diffOmitted: c.role === "viewer" ? null : d.diffOmitted, asks: d.asks, repoId: d.task.repo_id, twin }}
              shots={<TaskShots d={d} />} details={<TaskDetails d={d} sess={sess} />} switchTo={switchTo} />
          ) : (
            <NewTask key={chatId ?? "new"} agents={agents} preferredModel={preferredModel} projects={taskProjects(projects, process.env.MANDAT_DEMO_AGENTS === "1")} canAct={canAct(c.role)} initialText={prefill} initialChat={showChat(chat)} home={home} />
          )}
        </div>
      </div>
    </Shell>
  );
}
