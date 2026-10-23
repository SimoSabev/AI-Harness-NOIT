import type { Metadata } from "next";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import { pageName } from "../../lib/brand";
import { Shell } from "../../components/shell";
import { SystemPanel } from "../../components/system-panel";
import { card } from "../../components/ui";
import { controlKeys } from "../../lib/server/keys";
import { pageCtx } from "../../lib/server/page";
import { hasCap } from "../../lib/server/roles";
import { db } from "../../lib/server/db";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("system.title")) };
}

// D-370: every `mandat` command a person needs, from the web (and the desktop window) instead of a terminal.
export default async function SystemPage() {
  const c = await pageCtx();
  const t = await getT();
  const ctl = controlKeys(process.env);
  const allowed = await hasCap(db(), c.uid, c.org, "tools.manage");
  const jobs = ctl && allowed ? await ctl.jobs() : null;
  return (
    <Shell current="system" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("system.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">{t("system.intro")}</p>
      {jobs ? (
        <SystemPanel initial={jobs} />
      ) : (
        <p className={`${card} mt-6 p-5 text-sm`}>{allowed ? rich(t("system.onlyLocal"), { cmd: <code className="font-mono">pnpm local</code> }) : t("system.notAllowed")}</p>
      )}
    </Shell>
  );
}
