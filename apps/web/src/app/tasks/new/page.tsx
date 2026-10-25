import type { Metadata } from "next";
import { getT } from "../../../i18n/server";
import { rich } from "../../../i18n/rich";
import { pageName } from "../../../lib/brand";
import Link from "next/link";
import { NewTaskForm } from "../../../components/new-task-form";
import { Shell } from "../../../components/shell";
import { card } from "../../../components/ui";
import { db } from "../../../lib/server/db";
import { controlKeys } from "../../../lib/server/keys";
import { canAct, pageCtx } from "../../../lib/server/page";
import { firstRepo } from "../../../lib/server/queries";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("newTask.title")) };
}

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ text?: string | string[] }> }) {
  // E9a: "Make a task" from a night question prefills the text
  const q = (await searchParams).text;
  const prefill = typeof q === "string" ? q.slice(0, 4000) : undefined;
  const c = await pageCtx();
  const t = await getT();
  const repo = await firstRepo(db(), c.uid, c.org);
  const ctl = controlKeys(process.env);
  const k = (await ctl?.status())?.providers ?? [];
  const accounts = ((await ctl?.accounts()) ?? []).filter((a) => a.loggedIn);
  return (
    <Shell current="new" waiting={c.waiting}>
      <Link href="/" className="text-sm text-mute hover:text-ink">{t("task.back")}</Link>
      <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight">{t("newTask.title")}</h1>
      {!canAct(c.role) ? (
        <p className={`${card} mt-6 p-5 text-sm`}>{t("newTask.onlyApprovers")}</p>
      ) : !repo ? (
        <p className={`${card} mt-6 p-5 text-sm`}>{rich(t("common.noRepo"), { cmd: <code className="font-mono">pnpm local</code> })}</p>
      ) : (
        <NewTaskForm repo={repo} {...(prefill ? { initialText: prefill } : {})} ready={{ anthropic: k.includes("anthropic"), openai: k.includes("openai") }} accounts={accounts} />
      )}
    </Shell>
  );
}
