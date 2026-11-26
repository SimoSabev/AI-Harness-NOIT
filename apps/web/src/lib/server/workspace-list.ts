import type { T } from "../../i18n/t";
import type { WsTask } from "../../components/workspace";
import { ago, statusOf } from "../status";
import { taskTitle } from "../task-title";
import { foldJobs, mergeByTime, openConversationsToList } from "../task-list";
import { openConversations } from "./conversation";
import { board } from "./queries";
import type { Db } from "./sql";

// The workspace's list (the tasks page's left column), built once: a job's oracle, units and final check fold into one
// row for its conversation (D-554); "Ask first" conversations that are not a task or a job yet are rows too (D-583).
// D-624: the waiting count of the rail's badge and of the window title is this list's own, so all three say one number.
export async function workspaceList(d: Db, uid: string, org: string, t: T, now: Date = new Date()): Promise<WsTask[]> {
  const [b, convs] = await Promise.all([board(d, uid, org), openConversations(d, uid, org)]);
  const rows = b.columns.flatMap((col) => col.items).sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1));
  const folded = foldJobs(rows);
  const taskRows = folded.slice(0, 100).map((it) => {
    const x = it.kind === "job" ? it.newest : it.row;
    const s = statusOf(x, t.lang);
    const job = it.kind === "job";
    const merged = it.kind === "job" && it.merged;
    return { id: job ? it.conversation_id : x.id, href: job ? `/?chat=${it.conversation_id}` : `/?task=${x.id}`,
      text: job && x.spec_goal ? x.spec_goal : taskTitle(x, t), tone: merged ? "green" as const : s.tone, label: merged ? t("task.job.merged") : s.label, ago: ago(x.updated_at, now, t.lang), at: x.updated_at };
  });
  const shownJobs = new Set(folded.flatMap((it) => (it.kind === "job" ? [it.conversation_id] : [])));
  const convRows = openConversationsToList(convs, shownJobs).map((v) => ({
    id: v.id, href: `/?chat=${v.id}`, text: v.text || t("task.conv.untitled"),
    tone: v.status === "idle" ? "amber" as const : "blue" as const,
    label: v.purpose === "project" ? t("task.conv.project") : v.status === "idle" ? t("task.conv.waiting") : t("task.conv.answering"),
    ago: ago(v.updated_at, now, t.lang), at: v.updated_at,
  }));
  return mergeByTime(taskRows, convRows).slice(0, 100).map(({ at: _at, ...rest }) => rest);
}
