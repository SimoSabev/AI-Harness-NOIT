import type { Key, Params } from "../i18n/t";

// D-600: the start is one conversation with Harnova, pure: the numbers on top and the first message with buttons as
// answers. A project without an approved brief comes first (no task starts on it before its interview), then what
// waits for the person; otherwise it invites a task.
export interface HomeProject { id: string; name: string; brief: boolean }
export type HomeAction = { kind: "interview"; repo: string; label: { key: Key; params?: Params } } | { kind: "link"; href: string; label: { key: Key; params?: Params } };
export interface HomeBrief { stats: { waiting: number; running: number; projects: number; noBrief: number }; say: { key: Key; params?: Params }; actions: HomeAction[] }

export function homeBrief(o: { waiting: number; running: number; projects: HomeProject[]; firstWaiting: string | null }): HomeBrief {
  const missing = o.projects.filter((p) => !p.brief);
  const stats = { waiting: o.waiting, running: o.running, projects: o.projects.length, noBrief: missing.length };
  const waitingAct: HomeAction[] = o.firstWaiting ? [{ kind: "link", href: o.firstWaiting, label: { key: "home.act.waiting" } }] : [];
  if (o.projects.length === 0) return { stats, say: { key: "home.say.noProject" }, actions: [{ kind: "link", href: "/projects/add", label: { key: "home.act.add" } }] };
  const first = missing[0];
  if (first) {
    return {
      stats,
      say: { key: "home.say.noBrief", params: { name: first.name, n: o.waiting } },
      actions: [...missing.slice(0, 3).map((p): HomeAction => ({ kind: "interview", repo: p.id, label: { key: "home.act.meet", params: { name: p.name } } })), ...waitingAct],
    };
  }
  if (o.waiting > 0) return { stats, say: { key: "home.say.waiting", params: { n: o.waiting } }, actions: waitingAct };
  return { stats, say: { key: "home.say.calm", params: { n: o.running } }, actions: [] };
}
