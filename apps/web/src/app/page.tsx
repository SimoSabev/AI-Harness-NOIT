import type { Metadata } from "next";
import { LiveTask } from "../components/live-task";
import { TaskDetails, TaskShots } from "../components/task-details";
import { Shell } from "../components/shell";
import { NewTask, TaskList } from "../components/workspace";
import type { WsAgent } from "../components/workspace";
import { getT } from "../i18n/server";
import { agentChoices, agentLabel } from "../lib/agents";
import { pageTitle } from "../lib/inbox";
import { ago, statusOf } from "../lib/status";
import { taskFeed } from "../lib/server/chat-feed";
import { db } from "../lib/server/db";
import { controlKeys } from "../lib/server/keys";
import { canAct, pageCtx } from "../lib/server/page";
import { board, repos, taskDetail } from "../lib/server/queries";
import { sessionOf } from "../lib/server/workbench";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [c, t] = await Promise.all([pageCtx(), getT()]);
  return { title: pageTitle(c.waiting, t.lang) };
}

// The workspace (chat-first start page): the tasks on the left like conversations; the chosen one in the middle — the one
// page of a task (D-386: /tasks/:id redirects here); no task chosen → one box to start a new one. The overview is at /overview.
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ task?: string | string[]; text?: string | string[] }> }) {
  const c = await pageCtx();
  const t = await getT();
  const sp = await searchParams;
  const q = sp.task;
  // E9a: "Make a task" from a night question prefills the text (it used to open /tasks/new, D-384)
  const prefill = typeof sp.text === "string" ? sp.text.slice(0, 4000) : "";
  const selected = typeof q === "string" && /^t_[a-z0-9_]{1,40}$/.test(q) ? q : null;
  const [b, projects, initial, d, sess] = await Promise.all([
    board(db(), c.uid, c.org),
    repos(db(), c.uid, c.org),
    selected ? taskFeed(db(), c.uid, c.org, selected, -1) : null,
    selected ? taskDetail(db(), c.uid, c.org, c.role, selected) : null,
    selected ? sessionOf(db(), c.uid, c.org, selected) : null,
  ]);
  const now = new Date();
  const tasks = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1)).slice(0, 100).map((x) => {
    const s = statusOf(x, t.lang);
    return { id: x.id, text: x.text, tone: s.tone, label: s.label, ago: ago(x.updated_at, now, t.lang) };
  });
  let agents: WsAgent[] = [];
  if (!initial) {
    const ctl = controlKeys(process.env);
    const keys = (await ctl?.status())?.providers ?? [];
    const accounts = ((await ctl?.accounts()) ?? []).filter((a) => a.loggedIn).map((a) => a.agent);
    agents = agentChoices({ accounts, keys, demo: process.env.MANDAT_DEMO_AGENTS === "1" }).map((id) => ({ id, label: agentLabel(id, t.lang) }));
  }
  return (
    <Shell current="tasks" waiting={c.waiting} full>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="min-h-0 lg:border-r lg:border-line lg:pr-4">
          <TaskList tasks={tasks} selected={initial ? selected : null} />
        </div>
        <div className="flex min-h-0 flex-col">
          {initial && d && sess ? (
            <LiveTask key={selected} id={selected as string} initial={initial} canAct={canAct(c.role)} agentName={agentLabel(initial.task.agent, t.lang)}
              view={{ evidence: d.evidence, diff: c.role === "viewer" ? null : d.diff, diffOmitted: c.role === "viewer" ? null : d.diffOmitted, asks: d.asks, repoId: d.task.repo_id }}
              shots={<TaskShots d={d} />} details={<TaskDetails d={d} sess={sess} />} />
          ) : (
            <NewTask agents={agents} projects={projects} canAct={canAct(c.role)} initialText={prefill} />
          )}
        </div>
      </div>
    </Shell>
  );
}
