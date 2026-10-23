import Link from "next/link";
import { cookies } from "next/headers";
import { getT } from "../i18n/server";
import type { Key, Lang } from "../i18n/t";
import { HARNESS } from "../lib/brand";
import { overview } from "../lib/overview";
import type { Health } from "../lib/overview";
import { parseTheme } from "../lib/prefs";
import { currentUser } from "../lib/server/auth";
import { db } from "../lib/server/db";
import { board, membership, repos } from "../lib/server/queries";
import { ThemeToggle } from "./theme-switch";
import { btn } from "./ui";

// D-305: the frame of every page — a side bar that stays (sections, the projects with their health, settings, theme),
// one primary action (+ New task) on top. On a phone the side bar becomes a row of links.
type Current = "tasks" | "overview" | "board" | "harness" | "new" | "task" | "login" | "keys" | "settings" | "agents" | "tools" | "night" | "research";
const NAV: { id: Current; href: string; label: Key }[] = [
  { id: "tasks", href: "/", label: "nav.tasks" },
  { id: "overview", href: "/overview", label: "nav.overview" },
  { id: "agents", href: "/agents", label: "nav.agents" },
  { id: "board", href: "/board", label: "nav.board" },
  { id: "tools", href: "/tools", label: "nav.tools" },
  { id: "night", href: "/night", label: "nav.night" },
  { id: "research", href: "/research", label: "nav.research" },
  { id: "harness", href: "/harness", label: "nav.harness" },
  { id: "keys", href: "/keys", label: "nav.keys" },
  { id: "settings", href: "/settings", label: "nav.settings" },
];
export const HEALTH: Record<Health, { mark: string; text: string; label: Key }> = {
  bad: { mark: "bg-bad", text: "text-bad", label: "health.bad" },
  warn: { mark: "bg-warn", text: "text-warn", label: "health.warn" },
  ok: { mark: "bg-ok", text: "text-ok", label: "health.ok" },
  idle: { mark: "bg-idle", text: "text-mute", label: "health.idle" },
};

async function projects(lang: Lang): Promise<{ name: string; full_name: string; health: Health; waiting: number; active: number }[]> {
  const uid = await currentUser();
  if (!uid) return [];
  const m = await membership(db(), uid);
  if (!m) return [];
  const [b, r] = await Promise.all([board(db(), uid, m.org_id), repos(db(), uid, m.org_id)]);
  return overview(b.columns.flatMap((c) => c.items), r, new Date(), lang).projects;
}

export async function Shell({ current, waiting, wide = false, full = false, children }: { current: Current; wide?: boolean; full?: boolean; waiting: number | null; children: React.ReactNode }) {
  const t = await getT();
  const theme = parseTheme((await cookies()).get("theme")?.value);
  const list = waiting === null ? [] : await projects(t.lang);
  const nav = (n: (typeof NAV)[number]) => (
    <Link key={n.id} href={n.href} aria-current={current === n.id ? "page" : undefined}
      className="flex items-center gap-2 rounded-lg px-3 py-2 font-display text-sm tracking-wide text-mute transition hover:bg-raised hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text">
      <span className="flex-1">{t(n.label)}</span>
      {n.id === "tasks" && waiting !== null && waiting > 0 && <span className="rounded-full bg-warn-soft px-1.5 font-mono text-[11px] text-warn" aria-label={t.n("inbox.waitingYou", waiting)}>{waiting}</span>}
    </Link>
  );
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2" href="#main">{t("shell.skip")}</a>
      <div className="flex min-h-screen flex-col lg:flex-row">
        {waiting !== null && (
          <aside className="border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 px-4 py-3">
                <Link href="/" className="flex items-center gap-2 font-display font-semibold tracking-wide">
                  <span aria-hidden="true" className="hex inline-block h-6 w-7 bg-accent" />
                  {HARNESS || <span className="sr-only">{t("shell.home")}</span>}
                </Link>
                <div className="ml-auto lg:hidden"><Link href="/" className={btn.primary}>{t("shell.newTask")}</Link></div>
              </div>
              <nav aria-label={t("nav.main")} className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">{NAV.map(nav)}</nav>
              {list.length > 0 && (
                <div className="hidden px-2 pt-4 lg:block">
                  <p className="px-3 pb-2 font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">{t("shell.projects", { n: list.length })}</p>
                  <ul className="space-y-0.5">
                    {list.map((p) => (
                      <li key={p.full_name}>
                        <Link href={`/overview?project=${encodeURIComponent(p.full_name)}`} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-ink transition hover:bg-raised">
                          <span aria-hidden="true" className={`hex inline-block h-2.5 w-3 ${HEALTH[p.health].mark}`} />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="sr-only">{t(HEALTH[p.health].label)}</span>
                          {p.active > 0 && <span className="font-mono text-[11px] text-mute">{p.active}</span>}
                          {p.waiting > 0 && <span className="rounded-full bg-warn-soft px-1.5 font-mono text-[11px] text-warn">{p.waiting}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-auto hidden items-center gap-1 border-t border-line px-2 py-2 lg:flex">
                <ThemeToggle value={theme} />
                <form action="/api/auth/logout" method="post" className="ml-auto">
                  <button className={btn.ghost} type="submit">{t("shell.logout")}</button>
                </form>
              </div>
            </div>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          {waiting !== null && (
            <div className="sticky top-0 z-10 hidden h-14 items-center justify-end gap-2 border-b border-line bg-canvas/90 px-6 backdrop-blur lg:flex">
              <Link href="/" className={btn.primary}>{t("shell.newTask")}</Link>
            </div>
          )}
          <main id="main" tabIndex={-1} className={full ? "flex flex-col px-4 py-4 outline-none lg:h-[calc(100vh-3.5rem)] lg:px-6" : `mx-auto ${wide ? "max-w-[1400px]" : "max-w-5xl"} px-4 py-8 outline-none lg:px-8`}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
