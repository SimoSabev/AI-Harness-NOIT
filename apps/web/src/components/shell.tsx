import Link from "next/link";
import { getT } from "../i18n/server";
import type { Key } from "../i18n/t";
import { HARNESS } from "../lib/brand";
import { NAV, navActive } from "../lib/nav";
import type { Page } from "../lib/nav";
import type { Health } from "../lib/overview";
import { accountMenu } from "../lib/server/account/menu";
import { authMode } from "../lib/server/auth";
import { Tip } from "./ui";

// D-305, D-384: the frame of every page — a side bar with four sections (tasks, projects, memory, settings; D-403). A new task
// starts from the box on the tasks page, so the frame has no second "+ New task". On a phone the bar is a row of links.
export const HEALTH: Record<Health, { mark: string; text: string; label: Key }> = {
  bad: { mark: "bg-bad", text: "text-bad", label: "health.bad" },
  warn: { mark: "bg-warn", text: "text-warn", label: "health.warn" },
  ok: { mark: "bg-ok", text: "text-ok", label: "health.ok" },
  idle: { mark: "bg-idle", text: "text-mute", label: "health.idle" },
};

/** D-600: one line icon per place (1.75 px, the brand kit's iconography) */
const ICON: Record<(typeof NAV)[number]["id"], string> = {
  tasks: "M4 5h16v11H9l-5 4z",
  research: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  projects: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  memory: "M12 3l2.2 6.3L21 12l-6.8 2.7L12 21l-2.2-6.3L3 12l6.8-2.7z",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
};

export async function Shell({ current, waiting, wide = false, full = false, children }: { current: Page; wide?: boolean; full?: boolean; waiting: number | null; children: React.ReactNode }) {
  const t = await getT();
  const active = navActive(current);
  const account = authMode() === "local" ? await accountMenu() : "off";
  // D-600: the bar is icons only — the conversations are the column next to it. D-622: each icon has the brand's tooltip
  // (its name, what lives there, and for tasks how many wait) instead of the browser's slow title
  const nav = (n: (typeof NAV)[number]) => (
    <Tip key={n.id} side="rail" label={t(n.label)} hint={n.id === "tasks" && waiting ? `${t(`nav.tip.${n.id}`)} · ${t("nav.tip.waiting", { n: waiting })}` : t(`nav.tip.${n.id}`)}>
    <Link href={n.href} aria-current={active === n.id ? "page" : undefined}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-[10px] text-mute transition hover:bg-raised hover:text-ink aria-[current=page]:bg-raised aria-[current=page]:text-accent-text">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[n.id]} /></svg>
      <span className="sr-only">{t(n.label)}</span>
      {n.id === "tasks" && waiting !== null && waiting > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-warn px-1 text-center font-mono text-[10px] leading-4 text-canvas" aria-label={t.n("inbox.waitingYou", waiting)}>{waiting}</span>}
      {active === n.id && <span aria-hidden="true" className="absolute -left-[11px] top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent lg:block" />}
    </Link>
    </Tip>
  );
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2" href="#main">{t("shell.skip")}</a>
      <div className="flex min-h-screen flex-col lg:flex-row">
        {waiting !== null && (
          <aside className="relative z-40 border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-[68px] lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="flex h-full items-center gap-1 px-2 py-2 lg:flex-col lg:px-0 lg:py-3">
              <Tip side="rail" label={HARNESS || t("nav.tip.home")}>
                <Link href="/" className="flex size-11 shrink-0 items-center justify-center">
                  <span aria-hidden="true" className="logo-mark inline-block size-7" />
                  <span className="sr-only">{HARNESS || t("shell.home")}</span>
                </Link>
              </Tip>
              <nav aria-label={t("nav.main")} className="flex gap-1 overflow-x-auto lg:mt-3 lg:flex-col lg:items-center lg:overflow-visible">{NAV.map(nav)}</nav>
              {authMode() === "local" && (
                // D-498: the optional sign-in; the label says whether this computer is signed in
                <span className="mt-auto hidden lg:block">
                <Tip label={t("nav.tip.account")} hint={t(account === "signed_in" ? "account.menuSignedIn" : "account.menu")}>
                <Link href="/settings/account" className="flex size-11 items-center justify-center rounded-[10px] text-mute hover:bg-raised hover:text-ink">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg>
                  <span className="sr-only">{t(account === "signed_in" ? "account.menuSignedIn" : "account.menu")}</span>
                </Link>
                </Tip>
                </span>
              )}
              {authMode() !== "local" && (
                <form action="/api/auth/logout" method="post" className="mt-auto hidden lg:block">
                  <Tip label={t("shell.logout")}>
                  <button className="flex size-11 items-center justify-center rounded-[10px] text-mute hover:bg-raised hover:text-ink" type="submit">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
                    <span className="sr-only">{t("shell.logout")}</span>
                  </button>
                  </Tip>
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
