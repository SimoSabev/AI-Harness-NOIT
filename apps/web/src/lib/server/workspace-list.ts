import type { T } from "../../i18n/t";
import type { WsSub, WsTask } from "../../components/workspace";
import { ago, statusOf } from "../status";
import { taskTitle } from "../task-title";
import { mergeByTime, openConversationsToList, sessionsOf } from "../task-list";
import { openConversations } from "./conversation";
import { board, repos } from "./queries";
import type { Db } from "./sql";

// The workspace's list (the tasks page's left column), built once. D-633: a conversation is one session — its oracle,
// units, final check, single-agent comparison and started task are its sub-sessions (D-554 folded them into one row);
// "Ask first" conversations that are not a task or a job yet are sessions too (D-583). Each session carries its project.
// D-624: the waiting count of the rail's badge and of the window title is this list's own, so all three say one number.
export async function workspaceList(d: Db, uid: string, org: string, t: T, now: Date = new Date()): Promise<WsTask[]> {
  const [b, convs, projects] = await Promise.all([board(d, uid, org), openConversations(d, uid, org), repos(d, uid, org)]);
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
    const s = statusOf(newest, t.lang);
    const merged = it.rows.some((r) => r.job_merged === true);
    const goal = it.rows.find((r) => r.spec_goal)?.spec_goal;
    const one = it.rows.length === 1 && !newest.internal_role;
    return {
      id: it.conversation_id, href: `/?chat=${it.conversation_id}`, text: goal ?? taskTitle(newest, t),
      tone: merged ? "green" as const : s.tone, label: merged ? t("task.job.merged") : s.label, ago: ago(newest.updated_at, now, t.lang),
      ...project(newest.repo_id), ...(one ? {} : { subs: it.rows.map(sub) }), at: newest.updated_at,
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
