import type { T } from "../../i18n/t";
import type { WsSub, WsTask } from "../../components/workspace";
import { ago, statusOf } from "../status";
import { taskTitle } from "../task-title";
import { mergeByTime, openConversationsToList, sessionState, sessionSubs, sessionsOf } from "../task-list";
import { openConversations } from "./conversation";
import { board, latestJobs, repos } from "./queries";
import type { Db } from "./sql";

// The workspace's list (the tasks page's left column), built once. D-633: a conversation is one session — its oracle,
// units, final check, single-agent comparison and started task are its sub-sessions (D-554 folded them into one row);
// "Ask first" conversations that are not a task or a job yet are sessions too (D-583). Each session carries its project.
// D-624: the waiting count of the rail's badge and of the window title is this list's own, so all three say one number.
export async function workspaceList(d: Db, uid: string, org: string, t: T, now: Date = new Date()): Promise<WsTask[]> {
  const [b, convs, projects, jobs] = await Promise.all([board(d, uid, org), openConversations(d, uid, org), repos(d, uid, org), latestJobs(d, uid, org)]);
  const names = new Map(projects.map((p) => [p.id, p.full_name]));
  const project = (id: string | null | undefined) => ({ project: id ?? null, projectName: (id && names.get(id)) || "" });
  const rows = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1));
  const sub = (x: (typeof rows)[number]): WsSub => {
    const s = statusOf(x, t.lang);
    return { id: x.id, href: `/?task=${x.id}`, text: taskTitle(x, t), tone: s.tone, label: s.label, ago: ago(x.updated_at, now, t.lang) };
  };
  const sessions = sessionsOf(rows).slice(0, 100).map((it) => {
    if (it.kind === "task") return { ...sub(it.row), ...project(it.row.repo_id), at: it.row.updated_at };
    const newest = it.rows[0] as (typeof rows)[number];
    // D-709: the session's state is its latest job's (a sealed job waits for the person though its tasks are closed);
    // under it only what waits for the person — the attempts and earlier runs are in the job card
    const job = jobs.get(it.conversation_id) ?? null;
    const st = sessionState(job, statusOf(newest, t.lang));
    const goal = it.rows.find((r) => r.spec_goal)?.spec_goal;
    const one = it.rows.length === 1 && !newest.internal_role;
    const subs = sessionSubs(it.rows.map((r) => ({ ...sub(r), internal_role: r.internal_role ?? null })), job).map(({ internal_role: _r, ...x }) => x);
    return {
      id: it.conversation_id, href: `/?chat=${it.conversation_id}`, text: goal ?? taskTitle(newest, t),
      tone: st.tone, label: "say" in st ? t(st.say) : st.label, ago: ago(newest.updated_at, now, t.lang),
      ...project(newest.repo_id), ...(one || subs.length === 0 ? {} : { subs }), ...("say" in st && st.say === "task.job.review" ? { review: true } : {}), at: newest.updated_at,
    };
  });
  const shown = new Set(sessions.map((s) => s.id));
  const convRows = openConversationsToList(convs, shown).map((v) => ({
    id: v.id, href: `/?chat=${v.id}`, text: v.text || t("task.conv.untitled"),
    tone: v.status === "idle" ? "amber" as const : "blue" as const,
    label: v.purpose === "project" ? t("task.conv.project") : v.status === "idle" ? t("task.conv.waiting") : t("task.conv.answering"),
    ago: ago(v.updated_at, now, t.lang), ...project(v.repo), at: v.updated_at,
  }));
  return mergeByTime(sessions, convRows).slice(0, 100).map(({ at: _at, ...rest }) => rest);
}
