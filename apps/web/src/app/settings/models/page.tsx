import type { Metadata } from "next";
import Link from "next/link";
import { ConnectionsManager } from "../../../components/connections-ui";
import { Shell } from "../../../components/shell";
import { card } from "../../../components/ui";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { agentsView } from "../../../lib/server/connections";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("conn.title")) };
}

// D-393: Settings → Models — every saved connection with its models and the default the task box starts with.
export default async function ModelsPage() {
  const c = await pageCtx();
  const t = await getT();
  const v = await agentsView(t.lang);
  return (
    <Shell current="settings" waiting={c.waiting}>
      <p className="text-sm"><Link href="/settings" className="text-mute hover:text-ink">{t("settings.title")}</Link></p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{t("conn.title")}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-mute">{t("conn.intro")}</p>
      {!v.local ? <p className={`${card} p-5 text-sm text-mute`}>{t("conn.onlyLocal")}</p>
        : c.role !== "owner" ? <p className={`${card} p-5 text-sm text-mute`}>{t("error.keys_not_an_owner")}</p>
        : <ConnectionsManager connections={v.connections} agents={v.agents} preferred={{ agent: v.prefs.defaultAgent, model: v.prefs.defaultModel }} />}
    </Shell>
  );
}
