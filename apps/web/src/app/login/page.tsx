import type { Metadata } from "next";
import { btn, card, input } from "../../components/ui";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import type { Key } from "../../i18n/t";
import { HARNESS, pageName } from "../../lib/brand";
import { authMode } from "../../lib/server/auth";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("login.title")) };
}

const ERR: Record<string, Key> = { bad: "login.err.bad", no_org: "login.err.no_org", origin: "login.err.origin", off: "login.err.off" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  const t = await getT();
  const mode = authMode();
  const local = <code className="font-mono">pnpm local</code>;
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span aria-hidden="true" className="hex inline-block h-10 w-12 bg-accent" />
          <h1 className="font-display mt-4 text-2xl font-semibold tracking-tight">{HARNESS ? t("login.titleNamed", { name: HARNESS }) : t("login.title")}</h1>
          <p className="mt-1 text-sm text-mute">{t("login.tagline")}</p>
        </div>
        {mode === "none" ? (
          <p className={`${card} p-5 text-sm`}>{rich(t("login.notSetUp"), { cmd: local })}</p>
        ) : (
          <form className={`${card} space-y-4 p-6`} action="/api/auth/login" method="post">
            {e && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">{t(ERR[e] ?? "login.err.generic")}</p>}
            <label className="block">
              <span className="text-sm font-medium">{t("login.email")}</span>
              <input className={`${input} mt-1.5`} name="email" type="email" autoComplete="username" required />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("login.password")}</span>
              <input className={`${input} mt-1.5`} name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className={`${btn.primary} w-full`} type="submit">{t("login.submit")}</button>
            {mode === "dev" && <p className="text-center text-xs text-mute">{rich(t("login.devHint"), { cmd: local })}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
