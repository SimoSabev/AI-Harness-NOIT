import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { LocalAccessLink } from "../../components/local-access";
import { Shell } from "../../components/shell";
import { LangChoice, ThemeChoice } from "../../components/theme-switch";
import { card } from "../../components/ui";
import { getT } from "../../i18n/server";
import { pageName } from "../../lib/brand";
import { parseTheme } from "../../lib/prefs";
import { authMode } from "../../lib/server/auth";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("settings.title")) };
}

const link = "text-sm text-accent underline-offset-4 hover:underline";

// D-305, D-384: one settings page — the accounts that run the agents, language, theme, local access; the rest (system,
// tools, roles) under "Advanced". E7f: the language is the cookie `lang`; without it Accept-Language, else English.
export default async function SettingsPage() {
  const c = await pageCtx();
  const t = await getT();
  const jar = await cookies();
  return (
    <Shell current="settings" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
      <section aria-labelledby="s-keys" className={`${card} mt-8 p-5`}>
        <h2 id="s-keys" className="font-display text-base font-semibold">{t("keys.title")}</h2>
        <p className="mt-1 mb-3 text-sm text-mute">{t("keys.intro")}</p>
        <Link href="/keys" className={link}>{t("settings.keysLink")}</Link>
      </section>
      <section aria-labelledby="s-lang" className={`${card} mt-4 p-5`}>
        <h2 id="s-lang" className="mb-4 font-display text-base font-semibold">{t("settings.lang")}</h2>
        <LangChoice value={t.lang} />
      </section>
      <section aria-labelledby="s-theme" className={`${card} mt-4 p-5`}>
        <h2 id="s-theme" className="mb-4 font-display text-base font-semibold">{t("settings.theme")}</h2>
        <ThemeChoice value={parseTheme(jar.get("theme")?.value)} />
      </section>
      <LocalAccessLink />
      <details className={`${card} mt-4 p-5`}>
        <summary className="cursor-pointer font-display text-base font-semibold">{t("settings.advanced")}</summary>
        <ul className="mt-3 space-y-3">
          <li><Link href="/system" className={link}>{t("system.title")}</Link><p className="text-sm text-mute">{t("system.intro")}</p></li>
          <li><Link href="/tools" className={link}>{t("tools.title")}</Link><p className="text-sm text-mute">{t("settings.toolsHint")}</p></li>
          {authMode() !== "local" && <li><Link href="/settings/roles" className={link}>{t("settings.roles")}</Link><p className="text-sm text-mute">{t("settings.rolesHint")}</p></li>}
        </ul>
      </details>
    </Shell>
  );
}
