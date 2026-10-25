import type { Metadata } from "next";
import { LocalAccessPanel } from "../../../components/local-access";
import { Shell } from "../../../components/shell";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("local.title")) };
}

// E9g A3 (D-373): Settings → Local access. The list comes from the desktop app over the bridge; in a browser the page
// says it works only in the desktop app.
export default async function LocalAccessPage() {
  const c = await pageCtx();
  const t = await getT();
  return (
    <Shell current="settings" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("local.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">{t("local.intro")}</p>
      <LocalAccessPanel />
    </Shell>
  );
}
