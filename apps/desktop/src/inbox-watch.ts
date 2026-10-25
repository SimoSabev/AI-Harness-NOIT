import { DesktopInboxSnapshot } from "@mandat/contract";
import { dt } from "./i18n.js";
import type { Lang } from "./i18n.js";

// E9g A2 (AC-12.5): main reads the web's existing GET /api/inbox (the local owner through the loopback address, D-368)
// so the tray counter, the dock/taskbar badge and the "waiting for you" notifications keep working while the window is
// closed. Only id + text of the waiting items are kept (DesktopInboxSnapshot); nothing is written anywhere.

type Item = DesktopInboxSnapshot["items"][number];

export function inboxStep(prev: ReadonlySet<string> | null, snap: DesktopInboxSnapshot): { count: number; fresh: Item[]; ids: Set<string> } {
  const ids = new Set(snap.items.map((i) => i.id));
  return { count: snap.items.length, fresh: prev === null ? [] : snap.items.filter((i) => !prev.has(i.id)), ids };
}

/** One notification for what is new; none while the person is looking at the window. */
export function notificationFor(lang: Lang, fresh: readonly Item[], focused: boolean): { title: string; body: string; task_id?: string } | null {
  if (focused || fresh.length === 0) return null;
  const title = dt(lang, "notify.waiting");
  const first = fresh[0];
  if (fresh.length === 1 && first) return { title, body: first.text.replace(/\s+/g, " ").trim().slice(0, 200), task_id: first.id };
  return { title, body: dt(lang, "notify.waitingMany", { count: fresh.length }) };
}

export interface InboxWatcherDeps {
  base: () => string | null;
  fetch: (url: string) => Promise<Response>;
  onUpdate: (count: number, fresh: Item[]) => void;
}

export function createInboxWatcher(d: InboxWatcherDeps): { tick: () => Promise<void> } {
  let ids: Set<string> | null = null;
  return {
    async tick() {
      const base = d.base();
      if (!base) return;
      let raw: unknown;
      try {
        const r = await d.fetch(`${base}/api/inbox`);
        if (r.status !== 200) return;
        raw = await r.json();
      } catch {
        return; // not up, restarting, or not JSON: try again on the next tick
      }
      const snap = DesktopInboxSnapshot.safeParse(raw);
      if (!snap.success) return;
      const step = inboxStep(ids, snap.data);
      ids = step.ids;
      d.onUpdate(step.count, step.fresh);
    },
  };
}
