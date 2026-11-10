import type { Metadata } from "next";
import Link from "next/link";
import { ApiKeysPanel } from "../../../components/connections/api-keys/api-keys-panel";
import { OlderKeySections } from "../../../components/connections/api-keys/older-key-sections";
import { Shell } from "../../../components/shell";
import { card } from "../../../components/ui";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { agentsView } from "../../../lib/server/connections";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("apikeys.title")) };
}

// D-475: Settings → API keys — every key for every AI service in one place (several per service, each with a name); the
// keys become models in the task box and in Settings → Models. Below, everything /keys showed before (it redirects here).
export default async function ApiKeysPage() {
  const c = await pageCtx();
  const t = await getT();
  const v = await agentsView(t.lang);
  return (
    <Shell current="settings" waiting={c.waiting}>
      <p className="text-sm"><Link href="/settings" className="text-mute hover:text-ink">{t("settings.title")}</Link></p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{t("apikeys.title")}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-mute">{t("apikeys.intro")}</p>
      {!v.local ? <p className={`${card} p-5 text-sm text-mute`}>{t("conn.onlyLocal")}</p>
        : <ApiKeysPanel connections={v.connections} canEdit={c.role === "owner"} />}
      <OlderKeySections />
    </Shell>
  );
}
