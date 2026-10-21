import type { Metadata } from "next";
import { HARNESS, pageName } from "../../lib/brand";
import { btn, card, input } from "../../components/ui";
import { authMode } from "../../lib/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Вход") };

const ERR: Record<string, string> = { bad: "Грешен имейл или парола.", no_org: "Акаунтът не е член на организация.", origin: "Заявката не идва от този сайт.", off: "Входът не е настроен." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  const mode = authMode();
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span aria-hidden="true" className="hex inline-block h-10 w-12 bg-accent" />
          <h1 className="font-display mt-4 text-2xl font-semibold tracking-tight">{HARNESS ? `Вход в ${HARNESS}` : "Вход"}</h1>
          <p className="mt-1 text-sm text-mute">AI агенти, които не могат да излъжат за тестовете.</p>
        </div>
        {mode === "none" ? (
          <p className={`${card} p-5 text-sm`}>Входът не е настроен. Пусни харнеса с <code className="font-mono">pnpm local</code>.</p>
        ) : (
          <form className={`${card} space-y-4 p-6`} action="/api/auth/login" method="post">
            {e && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">{ERR[e] ?? "Входът не успя."}</p>}
            <label className="block">
              <span className="text-sm font-medium">Имейл</span>
              <input className={`${input} mt-1.5`} name="email" type="email" autoComplete="username" required />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Парола</span>
              <input className={`${input} mt-1.5`} name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className={`${btn.primary} w-full`} type="submit">Влез</button>
            {mode === "dev" && <p className="text-center text-xs text-mute">Имейлът и паролата са в терминала, където пусна <code className="font-mono">pnpm local</code>.</p>}
          </form>
        )}
      </div>
    </main>
  );
}
