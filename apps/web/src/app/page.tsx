import type { Metadata } from "next";
import { LiveTask } from "../components/live-task";
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
import { board, firstRepo } from "../lib/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [c, t] = await Promise.all([pageCtx(), getT()]);
  return { title: pageTitle(c.waiting, t.lang) };
}

// The workspace (chat-first start page): the tasks on the left like conversations; the chosen one live in the middle
// with how it is being built on the right; no task chosen → one box to start a new one. The overview is at /overview.
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ task?: string | string[]; text?: string | string[] }> }) {
  const c = await pageCtx();
  const t = await getT();
  const sp = await searchParams;
  const q = sp.task;
  // E9a: "Make a task" from a night question prefills the text (it used to open /tasks/new, D-384)
  const prefill = typeof sp.text === "string" ? sp.text.slice(0, 4000) : "";
  const selected = typeof q === "string" && /^t_[a-z0-9_]{1,40}$/.test(q) ? q : null;
  const [b, repo, initial] = await Promise.all([board(db(), c.uid, c.org), firstRepo(db(), c.uid, c.org), selected ? taskFeed(db(), c.uid, c.org, selected, -1) : null]);
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
          {initial ? (
            <LiveTask key={selected} id={selected as string} initial={initial} canAct={canAct(c.role)} agentName={agentLabel(initial.task.agent, t.lang)} />
          ) : (
            <NewTask agents={agents} repo={repo} canAct={canAct(c.role)} initialText={prefill} />
          )}
        </div>
      </div>
    </Shell>
  );
}
