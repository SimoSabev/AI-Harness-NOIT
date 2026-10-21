import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Shell } from "../../components/shell";
import { ThemeChoice, ViewChoice } from "../../components/theme-switch";
import { card } from "../../components/ui";
import { pageName } from "../../lib/brand";
import { parseTheme, parseView } from "../../lib/prefs";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Настройки") };

// D-305: per-person settings: theme (dark, light, like the system) and the default view of the start page.
export default async function SettingsPage() {
  const c = await pageCtx();
  const jar = await cookies();
  return (
    <Shell current="settings" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Настройки</h1>
      <p className="mt-1 text-sm text-mute">Важат за този браузър.</p>
      <section aria-labelledby="s-theme" className={`${card} mt-8 p-5`}>
        <h2 id="s-theme" className="font-display text-base font-semibold">Тема</h2>
        <p className="mt-1 mb-4 text-sm text-mute">Тъмната е по подразбиране. Светлата е същият дизайн с други цветове.</p>
        <ThemeChoice value={parseTheme(jar.get("theme")?.value)} />
      </section>
      <section aria-labelledby="s-view" className={`${card} mt-4 p-5`}>
        <h2 id="s-view" className="font-display text-base font-semibold">Изглед на главната</h2>
        <p className="mt-1 mb-4 text-sm text-mute">Сменя се и с бутоните горе на главната.</p>
        <ViewChoice value={parseView(jar.get("view")?.value)} />
      </section>
      <section aria-labelledby="s-term" className={`${card} mt-4 p-5`}>
        <h2 id="s-term" className="font-display text-base font-semibold">В терминала</h2>
        <p className="mt-1 text-sm text-mute">Същото табло без браузър: <code className="font-mono text-ink">pnpm mandat tui</code>.</p>
      </section>
    </Shell>
  );
}
