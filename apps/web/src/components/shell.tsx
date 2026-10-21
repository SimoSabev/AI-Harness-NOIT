import Link from "next/link";
import { btn } from "./ui";

// D-292: one top bar — the tasks, the one primary action (new task), sign out.
export function Shell({ current, waiting, children }: { current: "tasks" | "new" | "task" | "login"; waiting: number | null; children: React.ReactNode }) {
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2" href="#main">Към съдържанието</a>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-md bg-zinc-900 text-xs text-white dark:bg-white dark:text-zinc-900">М</span>
            Мандат
          </Link>
          {waiting !== null && (
            <nav aria-label="Основна" className="flex flex-1 items-center gap-1">
              <Link href="/" aria-current={current === "tasks" ? "page" : undefined} className={`${btn.ghost} aria-[current=page]:text-zinc-900 dark:aria-[current=page]:text-white`}>
                Задачи
                {waiting > 0 && <span className="ml-2 rounded-full bg-zinc-900 px-1.5 text-xs text-white dark:bg-white dark:text-zinc-900" aria-label={`${waiting} чакат теб`}>{waiting}</span>}
              </Link>
              <div className="ml-auto flex items-center gap-2">
                <Link href="/tasks/new" className={btn.primary}>+ Нова задача</Link>
                <form action="/api/auth/logout" method="post">
                  <button className={btn.ghost} type="submit">Изход</button>
                </form>
              </div>
            </nav>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-8 outline-none">
        {children}
      </main>
    </>
  );
}
