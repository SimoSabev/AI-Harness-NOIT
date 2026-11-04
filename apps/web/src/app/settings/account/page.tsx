import type { Metadata } from "next";
import Link from "next/link";
import { AccountPanel } from "../../../components/connections/account/account-panel";
import { Shell } from "../../../components/shell";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("account.title")) };
}

// D-498: Settings → Profile and sync. Optional: without signing in nothing changes and nothing leaves this computer.
export default async function AccountPage() {
  const c = await pageCtx();
  const t = await getT();
  return (
    <Shell current="settings" waiting={c.waiting}>
      <p className="text-sm"><Link href="/settings" className="text-accent underline-offset-4 hover:underline">{t("settings.title")}</Link></p>
      <h1 className="mt-2 mb-6 font-display text-2xl font-semibold tracking-tight">{t("account.title")}</h1>
      <AccountPanel />
    </Shell>
  );
}
