import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ConnectionsHub } from "../../components/connections/hub";
import { connectionTiles } from "../../components/connections/hub-view";
import { subscriptionCards } from "../../components/connections/subscriptions/subscriptions-view";
import { LocalAccessLink } from "../../components/local-access";
import { Shell } from "../../components/shell";
import { LangChoice, ThemeChoice } from "../../components/theme-switch";
import { AppearanceChoice } from "../../components/appearance-choice";
import { parseAppearance } from "../../lib/appearance";
import { card } from "../../components/ui";
import { getT } from "../../i18n/server";
import { pageName } from "../../lib/brand";
import { parseTheme } from "../../lib/prefs";
import { accountMenu } from "../../lib/server/account/menu";
import { authMode } from "../../lib/server/auth";
import { agentsView } from "../../lib/server/connections";
import { db } from "../../lib/server/db";
import { controlKeys } from "../../lib/server/keys";
import { mcpCatalog } from "../../lib/server/mcp";
import { skillCatalog } from "../../lib/server/tools-import";
import { PROVIDERS } from "@mandat/contract";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("settings.title")) };
}

const link = "text-sm text-accent underline-offset-4 hover:underline";

// D-498: "Profile and sync" (optional sign-in) sits right under the accounts, only in `pnpm local`.
// D-305, D-384: one settings page — the accounts that run the agents, language, theme, local access; the rest (system,
// tools, roles) under "Advanced". E7f: the language is the cookie `lang`; without it Accept-Language, else English.
export default async function SettingsPage() {
  const c = await pageCtx();
  const t = await getT();
  const jar = await cookies();
  // D-500: what is connected now, for the hub at the top
  const v = await agentsView(t.lang);
  const accounts = (await controlKeys(process.env)?.accounts()) ?? [];
  const [servers, skills, account] = await Promise.all([mcpCatalog(db(), c.uid, c.org), skillCatalog(db(), c.uid, c.org), v.local ? accountMenu() : Promise.resolve("hidden" as const)]);
  const tiles = connectionTiles({ local: v.local, subscriptions: subscriptionCards(accounts), keys: v.connections.map((k) => ({ hasKey: k.hasKey, kind: PROVIDERS[k.provider].kind })), servers, skills, models: v.agents.filter((a) => !a.id.startsWith("fake")).reduce((n, a) => n + a.models.length, 0), account });
  return (
    <Shell current="settings" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
      <ConnectionsHub t={t} tiles={tiles} />
      <section aria-labelledby="s-keys" className={`${card} mt-8 p-5`}>
        <h2 id="s-keys" className="font-display text-base font-semibold">{t("keys.title")}</h2>
        <p className="mt-1 mb-3 text-sm text-mute">{t("keys.intro")}</p>
        <p className="flex flex-wrap gap-4">
          <Link href="/settings/subscriptions" className={link}>{t("settings.subsLink")}</Link>
          <Link href="/settings/models" className={link}>{t("conn.title")}</Link>
          <Link href="/settings/api-keys" className={link}>{t("settings.keysLink")}</Link>
          {/* D-556: Jarvis */}
          <Link href="/settings/voice" className={link}>{t("voice.settings.title")}</Link>
        </p>
        {/* D-475: one row for every AI service's API keys */}
        <p className="mt-4 border-t border-line pt-4">
          <Link href="/settings/api-keys" className={link}>{t("apikeys.title")}</Link>
          <span className="mt-0.5 block text-sm text-mute">{t("settings.apiKeysHint")}</span>
        </p>
      </section>
      {authMode() === "local" && account !== "hidden" && (
        <section aria-labelledby="s-account" className={`${card} mt-4 p-5`}>
          <h2 id="s-account" className="font-display text-base font-semibold">{t("settings.account")}</h2>
          <p className="mt-1 mb-3 text-sm text-mute">{t("settings.accountHint")}</p>
          <Link href="/settings/account" className={link}>{t(account === "signed_in" ? "account.menuSignedIn" : "account.signIn")}</Link>
        </section>
      )}

      <section aria-labelledby="s-tools" className={`${card} mt-4 p-5`}>
        <h2 id="s-tools" className="font-display text-base font-semibold">{t("tt.title")}</h2>
        <p className="mt-1 mb-3 text-sm text-mute">{t("tt.settingsHint")}</p>
        <Link href="/settings/tools" className={link}>{t("tt.open")}</Link>
      </section>
      <section aria-labelledby="s-lang" className={`${card} mt-4 p-5`}>
        <h2 id="s-lang" className="mb-4 font-display text-base font-semibold">{t("settings.lang")}</h2>
        <LangChoice value={t.lang} />
      </section>
      <section aria-labelledby="s-theme" className={`${card} mt-4 p-5`}>
        <h2 id="s-theme" className="mb-4 font-display text-base font-semibold">{t("settings.theme")}</h2>
        <ThemeChoice value={parseTheme(jar.get("theme")?.value)} />
      </section>
      {/* D-599: the person's accent, ground, Nova colour and size */}
      <section aria-labelledby="s-look" className={`${card} mt-4 p-5`}>
        <h2 id="s-look" className="font-display text-base font-semibold">{t("settings.look")}</h2>
        <p className="mb-4 text-sm text-mute">{t("settings.lookHint")}</p>
        <AppearanceChoice value={parseAppearance({ accent: jar.get("accent")?.value, ground: jar.get("ground")?.value, nova: jar.get("nova")?.value, scale: jar.get("scale")?.value })} />
      </section>
      <LocalAccessLink />
      <details className={`${card} mt-4 p-5`}>
        <summary className="cursor-pointer font-display text-base font-semibold">{t("settings.advanced")}</summary>
        <ul className="mt-3 space-y-3">
          <li><Link href="/system" className={link}>{t("system.title")}</Link><p className="text-sm text-mute">{t("system.intro")}</p></li>
          {authMode() !== "local" && <li><Link href="/settings/roles" className={link}>{t("settings.roles")}</Link><p className="text-sm text-mute">{t("settings.rolesHint")}</p></li>}
        </ul>
      </details>
    </Shell>
  );
}
