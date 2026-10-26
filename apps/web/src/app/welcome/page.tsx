import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectWizard } from "../../components/connections-ui";
import { Shell } from "../../components/shell";
import { card } from "../../components/ui";
import { getT } from "../../i18n/server";
import { pageName } from "../../lib/brand";
import { agentsView, detectLocal } from "../../lib/server/connections";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("welcome.title")) };
}

// D-393: the first-run page — what you have (subscriptions, API keys, a model on this computer), connect, the default.
// Opens by itself while nothing can run a task; "Add a connection" in Settings → Models opens it again.
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ add?: string; step?: string }> }) {
  const c = await pageCtx();
  const t = await getT();
  const sp = await searchParams;
  const [v, detect] = await Promise.all([agentsView(t.lang), detectLocal()]);
  if (!v.local) redirect("/keys");
  return (
    <Shell current="settings" waiting={c.waiting}>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t(sp.add ? "welcome.addTitle" : "welcome.title")}</h1>
        <p className="mt-2 text-sm text-mute">{t("welcome.intro")}</p>
        {c.role !== "owner" && <p className={`${card} mt-6 p-5 text-sm text-mute`}>{t("error.keys_not_an_owner")}</p>}
      </div>
      {c.role === "owner" && <div className="mt-8"><ConnectWizard connections={v.connections} detect={detect} agents={v.agents} accountName={v.accountName} startAt={sp.step === "default" ? "default" : "pick"} /></div>}
    </Shell>
  );
}
