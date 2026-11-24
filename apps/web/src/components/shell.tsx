import Link from "next/link";
import { getT } from "../i18n/server";
import type { Key } from "../i18n/t";
import { HARNESS } from "../lib/brand";
import { NAV, navActive } from "../lib/nav";
import type { Page } from "../lib/nav";
import type { Health } from "../lib/overview";
import { accountMenu } from "../lib/server/account/menu";
import { authMode } from "../lib/server/auth";
import { btn } from "./ui";

// D-305, D-384: the frame of every page — a side bar with four sections (tasks, projects, memory, settings; D-403). A new task
// starts from the box on the tasks page, so the frame has no second "+ New task". On a phone the bar is a row of links.
export const HEALTH: Record<Health, { mark: string; text: string; label: Key }> = {
  bad: { mark: "bg-bad", text: "text-bad", label: "health.bad" },
  warn: { mark: "bg-warn", text: "text-warn", label: "health.warn" },
  ok: { mark: "bg-ok", text: "text-ok", label: "health.ok" },
  idle: { mark: "bg-idle", text: "text-mute", label: "health.idle" },
};

export async function Shell({ current, waiting, wide = false, full = false, children }: { current: Page; wide?: boolean; full?: boolean; waiting: number | null; children: React.ReactNode }) {
  const t = await getT();
  const active = navActive(current);
  const account = authMode() === "local" ? await accountMenu() : "off";
  const nav = (n: (typeof NAV)[number]) => (
    <Link key={n.id} href={n.href} aria-current={active === n.id ? "page" : undefined}
      className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-mute transition hover:bg-raised hover:text-ink aria-[current=page]:bg-raised aria-[current=page]:text-ink">
      {/* D-599: a hollow diamond; the current section's is filled with the accent */}
      <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45 border-[1.5px] border-line-strong group-aria-[current=page]:border-accent group-aria-[current=page]:bg-accent" />
      <span className="flex-1">{t(n.label)}</span>
      {n.id === "tasks" && waiting !== null && waiting > 0 && <span className="font-mono text-[11px] text-warn" aria-label={t.n("inbox.waitingYou", waiting)}>{waiting}</span>}
    </Link>
  );
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2" href="#main">{t("shell.skip")}</a>
      <div className="flex min-h-screen flex-col lg:flex-row">
        {waiting !== null && (
          <aside className="border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 px-4 py-3">
                <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
                  <span aria-hidden="true" className="logo-mark inline-block size-7" />
                  {HARNESS || <span className="sr-only">{t("shell.home")}</span>}
                </Link>
              </div>
              <nav aria-label={t("nav.main")} className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">{NAV.map(nav)}</nav>
              {authMode() === "local" && (
                // D-498: the optional sign-in; the label says whether this computer is signed in
                <Link href="/settings/account" className={`mt-auto hidden border-t border-line px-2 py-2 lg:block`}>
                  <span className={btn.ghost}>{t(account === "signed_in" ? "account.menuSignedIn" : "account.menu")}</span>
                </Link>
              )}
              {authMode() !== "local" && (
                <form action="/api/auth/logout" method="post" className="mt-auto hidden border-t border-line px-2 py-2 lg:block">
                  <button className={btn.ghost} type="submit">{t("shell.logout")}</button>
                </form>
              )}
            </div>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          <main id="main" tabIndex={-1} className={full ? "flex flex-col px-4 py-4 outline-none lg:h-screen lg:px-6" : `mx-auto ${wide ? "max-w-[1400px]" : "max-w-5xl"} px-4 py-8 outline-none lg:px-8`}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
