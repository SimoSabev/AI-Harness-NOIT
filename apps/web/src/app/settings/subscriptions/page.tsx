import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionsPanel } from "../../../components/connections/subscriptions/subscriptions-panel";
import { subscriptionCards } from "../../../components/connections/subscriptions/subscriptions-view";
import { Shell } from "../../../components/shell";
import { card } from "../../../components/ui";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { controlKeys } from "../../../lib/server/keys";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("subs.title")) };
}

// D-462: Settings → Subscriptions — every signed-in subscription and "Add subscription" (the registry of D-460).
export default async function SubscriptionsPage() {
  const c = await pageCtx();
  const t = await getT();
  const ctl = controlKeys(process.env);
  const accounts = (await ctl?.accounts()) ?? [];
  return (
    <Shell current="settings" waiting={c.waiting}>
      <p className="text-sm"><Link href="/settings" className="text-mute hover:text-ink">{t("settings.title")}</Link></p>
      <div className="mt-1">
        {!ctl ? <p className={`${card} p-5 text-sm text-mute`}>{t("conn.onlyLocal")}</p>
          : <SubscriptionsPanel cards={subscriptionCards(accounts)} canManage={c.role === "owner"} />}
      </div>
    </Shell>
  );
}
