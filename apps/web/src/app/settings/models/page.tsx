import type { Metadata } from "next";
import Link from "next/link";
import { ConnectionsManager } from "../../../components/connections-ui";
import { Shell } from "../../../components/shell";
import { card } from "../../../components/ui";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { agentsView } from "../../../lib/server/connections";
import { UsagePanel } from "../../../components/usage-panel";
import { usageView } from "../../../lib/usage";
import { db } from "../../../lib/server/db";
import { accountLimits } from "../../../lib/server/conversation";
import { usageRows } from "../../../lib/server/usage";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("conn.title")) };
}

// D-393: Settings → Models — every saved connection with its models and the default the task box starts with.
// D-629: above them, the usage — what each account and model spent, the work it did, and what is left.
export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const c = await pageCtx();
  const t = await getT();
  const days = (await searchParams).days === "30" ? 30 : 7;
  const limits = await accountLimits(db(), c.org);
  const [v, rows] = await Promise.all([agentsView(t.lang, process.env, limits), usageRows(db(), c.org, days + 1)]);
  const usage = usageView(rows, v.agents, { now: Date.now(), days });
  return (
    <Shell current="settings" waiting={c.waiting}>
      <p className="text-sm"><Link href="/settings" className="text-mute hover:text-ink">{t("settings.title")}</Link></p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{t("conn.title")}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-mute">{t("conn.intro")}</p>
      <UsagePanel v={usage} days={days} t={t} />
      {!v.local ? <p className={`${card} p-5 text-sm text-mute`}>{t("conn.onlyLocal")}</p>
        : c.role !== "owner" ? <p className={`${card} p-5 text-sm text-mute`}>{t("error.keys_not_an_owner")}</p>
        : <ConnectionsManager connections={v.connections} agents={v.agents} preferred={{ agent: v.prefs.defaultAgent, model: v.prefs.defaultModel }} />}
    </Shell>
  );
}
