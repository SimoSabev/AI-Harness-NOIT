// D-554 (screens 19.11.2026): the oracle, the units and the final check of one job are one piece of work for the person;
// the task list shows them as one row for their conversation (opened with /?chat=…), at the place of the newest of them.
export interface FoldSource { id: string; updated_at: string; internal_role?: "oracle" | "unit" | "final" | null; conversation_id?: string | null }
export type ListItem<T extends FoldSource> = { kind: "task"; row: T } | { kind: "job"; conversation_id: string; newest: T; count: number };

/** rows come newest first; the order is kept */
export function foldJobs<T extends FoldSource>(rows: readonly T[]): ListItem<T>[] {
  const out: ListItem<T>[] = [];
  const jobs = new Map<string, { kind: "job"; conversation_id: string; newest: T; count: number }>();
  for (const r of rows) {
    const conv = r.internal_role ? r.conversation_id : null;
    if (!conv) {
      out.push({ kind: "task", row: r });
      continue;
    }
    const seen = jobs.get(conv);
    if (seen) {
      jobs.set(conv, { ...seen, count: seen.count + 1 });
      continue;
    }
    const item = { kind: "job" as const, conversation_id: conv, newest: r, count: 1 };
    jobs.set(conv, item);
    out.push(item);
  }
  return out.map((x) => (x.kind === "job" ? (jobs.get(x.conversation_id) ?? x) : x));
}
