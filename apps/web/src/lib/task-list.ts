// D-554 (screens 19.11.2026): the oracle, the units and the final check of one job are one piece of work for the person;
// the task list shows them as one row for their conversation (opened with /?chat=…), at the place of the newest of them;
// `merged`: the job is in the project's main (jobs.merged_sha), shown as "Merged", not "Closed".
export interface FoldSource { id: string; updated_at: string; internal_role?: "oracle" | "unit" | "final" | null; conversation_id?: string | null; job_merged?: boolean | null }
export type ListItem<T extends FoldSource> = { kind: "task"; row: T } | { kind: "job"; conversation_id: string; newest: T; count: number; merged: boolean };

/** rows come newest first; the order is kept */
export function foldJobs<T extends FoldSource>(rows: readonly T[]): ListItem<T>[] {
  const out: ListItem<T>[] = [];
  const jobs = new Map<string, { kind: "job"; conversation_id: string; newest: T; count: number; merged: boolean }>();
  for (const r of rows) {
    const conv = r.internal_role ? r.conversation_id : null;
    if (!conv) {
      out.push({ kind: "task", row: r });
      continue;
    }
    const seen = jobs.get(conv);
    if (seen) {
      jobs.set(conv, { ...seen, count: seen.count + 1, merged: seen.merged || r.job_merged === true });
      continue;
    }
    const item = { kind: "job" as const, conversation_id: conv, newest: r, count: 1, merged: r.job_merged === true };
    jobs.set(conv, item);
    out.push(item);
  }
  return out.map((x) => (x.kind === "job" ? (jobs.get(x.conversation_id) ?? x) : x));
}

/** D-583: a conversation of "Ask first" as the task list needs it (the person's first words are its title) */
export interface OpenConversation { id: string; text: string; purpose: string; status: string; phase: string; updated_at: string; job_id: string | null; task_id: string | null }

/** the conversations to list: not a task or a job yet, and not already shown as a job row; newest first */
export function openConversationsToList(convs: readonly OpenConversation[], shown: ReadonlySet<string>): OpenConversation[] {
  return convs.filter((c) => c.job_id === null && c.task_id === null && !shown.has(c.id)).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

/** two lists by time, newest first */
export function mergeByTime<T extends { at: string }>(a: readonly T[], b: readonly T[]): T[] {
  return [...a, ...b].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}
