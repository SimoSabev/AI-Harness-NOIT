import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { LocalAccessLink } from "../../components/local-access";
import { Shell } from "../../components/shell";
import { LangChoice, SampleChoice, ThemeChoice, ViewChoice } from "../../components/theme-switch";
import { card } from "../../components/ui";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import { pageName } from "../../lib/brand";
import { parseSample, parseTheme, parseView } from "../../lib/prefs";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("settings.title")) };
}

// D-305: per-person settings: theme (dark, light, like the system) and the default view of the start page.
// E7f: and the language of the interface (cookie `lang`; without it Accept-Language, else English).
export default async function SettingsPage() {
  const c = await pageCtx();
  const t = await getT();
  const jar = await cookies();
  return (
    <Shell current="settings" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
      <p className="mt-1 text-sm text-mute">{t("settings.intro")}</p>
      <section aria-labelledby="s-lang" className={`${card} mt-8 p-5`}>
        <h2 id="s-lang" className="font-display text-base font-semibold">{t("settings.lang")}</h2>
        <p className="mt-1 mb-4 text-sm text-mute">{t("settings.langHint")}</p>
        <LangChoice value={t.lang} />
      </section>
      <section aria-labelledby="s-theme" className={`${card} mt-4 p-5`}>
        <h2 id="s-theme" className="font-display text-base font-semibold">{t("settings.theme")}</h2>
        <p className="mt-1 mb-4 text-sm text-mute">{t("settings.themeHint")}</p>
        <ThemeChoice value={parseTheme(jar.get("theme")?.value)} />
      </section>
      <section aria-labelledby="s-view" className={`${card} mt-4 p-5`}>
        <h2 id="s-view" className="font-display text-base font-semibold">{t("settings.view")}</h2>
        <p className="mt-1 mb-4 text-sm text-mute">{t("settings.viewHint")}</p>
        <ViewChoice value={parseView(jar.get("view")?.value)} />
      </section>
      <section aria-labelledby="s-sample" className={`${card} mt-4 p-5`}>
        <h2 id="s-sample" className="font-display text-base font-semibold">{t("settings.sample")}</h2>
        <p className="mt-1 mb-4 text-sm text-mute">{t("settings.sampleHint")}</p>
        <SampleChoice value={parseSample(jar.get("sample")?.value)} />
      </section>
      <section aria-labelledby="s-roles" className={`${card} mt-4 p-5`}>
        <h2 id="s-roles" className="font-display text-base font-semibold">{t("settings.roles")}</h2>
        <p className="mt-1 mb-3 text-sm text-mute">{t("settings.rolesHint")}</p>
        <Link href="/settings/roles" className="text-sm text-accent underline-offset-4 hover:underline">{t("settings.rolesLink")}</Link>
      </section>
      <LocalAccessLink />
      <section aria-labelledby="s-term" className={`${card} mt-4 p-5`}>
        <h2 id="s-term" className="font-display text-base font-semibold">{t("settings.terminal")}</h2>
        <p className="mt-1 text-sm text-mute">{rich(t("settings.terminalHint"), { cmd: <code className="font-mono text-ink">pnpm mandat tui</code> })}</p>
      </section>
    </Shell>
  );
}
