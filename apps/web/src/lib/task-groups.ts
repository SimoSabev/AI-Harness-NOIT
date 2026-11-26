import type { Key } from "../i18n/t";
import type { Tone } from "./status";

// D-611: the list of conversations in three groups, like a product's inbox — what waits for the person (amber, red),
// what runs (blue), what is done (green, gray); each group keeps the list's order (newest first). Titles lose the
// model's "Goal:" prefix.
export type GroupId = "waiting" | "running" | "done";
const OF: Record<Tone, GroupId> = { amber: "waiting", red: "waiting", blue: "running", green: "done", gray: "done" };
export const GROUP_LABEL: Record<GroupId, Key> = { waiting: "ws.group.waiting", running: "ws.group.running", done: "ws.group.done" };

export function groupTasks<T extends { tone: Tone }>(tasks: readonly T[]): { id: GroupId; items: T[] }[] {
  return (["waiting", "running", "done"] as const).map((id) => ({ id, items: tasks.filter((x) => OF[x.tone] === id) })).filter((g) => g.items.length > 0);
}

export function cleanTitle(s: string): string {
  return s.replace(/^\s*(goal|\u0446\u0435\u043b)\s*:\s*/i, "").trim();
}
