import Link from "next/link";
import { cookies } from "next/headers";
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
// one primary action (+ Нова задача) on top. On a phone the side bar becomes a row of links.
type Current = "tasks" | "board" | "harness" | "new" | "task" | "login" | "keys" | "settings" | "agents" | "tools" | "night" | "research";
const NAV: { id: Current; href: string; label: string }[] = [
  { id: "tasks", href: "/", label: "Главна" },
  { id: "agents", href: "/agents", label: "Агенти" },
  { id: "board", href: "/board", label: "Дъска" },
  { id: "tools", href: "/tools", label: "Инструменти" },
  { id: "night", href: "/night", label: "Нощна смяна" },
  { id: "research", href: "/research", label: "Ресърч" },
  { id: "harness", href: "/harness", label: "Правила" },
  { id: "keys", href: "/keys", label: "Акаунти" },
  { id: "settings", href: "/settings", label: "Настройки" },
];
export const HEALTH: Record<Health, { mark: string; text: string; label: string }> = {
  bad: { mark: "bg-bad", text: "text-bad", label: "провал" },
  warn: { mark: "bg-warn", text: "text-warn", label: "чака теб" },
  ok: { mark: "bg-ok", text: "text-ok", label: "върви" },
  idle: { mark: "bg-idle", text: "text-mute", label: "тихо" },
};

async function projects(): Promise<{ name: string; full_name: string; health: Health; waiting: number; active: number }[]> {
  const uid = await currentUser();
  if (!uid) return [];
  const m = await membership(db(), uid);
  if (!m) return [];
  const [b, r] = await Promise.all([board(db(), uid, m.org_id), repos(db(), uid, m.org_id)]);
  return overview(b.columns.flatMap((c) => c.items), r).projects;
}

export async function Shell({ current, waiting, wide = false, children }: { current: Current; wide?: boolean; waiting: number | null; children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get("theme")?.value);
  const list = waiting === null ? [] : await projects();
  const nav = (n: (typeof NAV)[number]) => (
    <Link key={n.id} href={n.href} aria-current={current === n.id ? "page" : undefined}
      className="flex items-center gap-2 rounded-lg px-3 py-2 font-display text-sm tracking-wide text-mute transition hover:bg-raised hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text">
      <span className="flex-1">{n.label}</span>
      {n.id === "tasks" && waiting !== null && waiting > 0 && <span className="rounded-full bg-warn-soft px-1.5 font-mono text-[11px] text-warn" aria-label={`${waiting} чакат теб`}>{waiting}</span>}
    </Link>
  );
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2" href="#main">Към съдържанието</a>
      <div className="flex min-h-screen flex-col lg:flex-row">
        {waiting !== null && (
          <aside className="border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 px-4 py-3">
                <Link href="/" className="flex items-center gap-2 font-display font-semibold tracking-wide">
                  <span aria-hidden="true" className="hex inline-block h-6 w-7 bg-accent" />
                  {HARNESS || <span className="sr-only">Начало</span>}
                </Link>
                <div className="ml-auto lg:hidden"><Link href="/tasks/new" className={btn.primary}>+ Нова задача</Link></div>
              </div>
              <nav aria-label="Основна" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">{NAV.map(nav)}</nav>
              {list.length > 0 && (
                <div className="hidden px-2 pt-4 lg:block">
                  <p className="px-3 pb-2 font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">Проекти · {list.length}</p>
                  <ul className="space-y-0.5">
                    {list.map((p) => (
                      <li key={p.full_name}>
                        <Link href={`/?project=${encodeURIComponent(p.full_name)}`} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-ink transition hover:bg-raised">
                          <span aria-hidden="true" className={`hex inline-block h-2.5 w-3 ${HEALTH[p.health].mark}`} />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="sr-only">{HEALTH[p.health].label}</span>
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
                  <button className={btn.ghost} type="submit">Изход</button>
                </form>
              </div>
            </div>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          {waiting !== null && (
            <div className="sticky top-0 z-10 hidden h-14 items-center justify-end gap-2 border-b border-line bg-canvas/90 px-6 backdrop-blur lg:flex">
              <Link href="/tasks/new" className={btn.primary}>+ Нова задача</Link>
            </div>
          )}
          <main id="main" tabIndex={-1} className={`mx-auto ${wide ? "max-w-[1400px]" : "max-w-5xl"} px-4 py-8 outline-none lg:px-8`}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
