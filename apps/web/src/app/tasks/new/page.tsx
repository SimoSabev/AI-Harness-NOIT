import type { Metadata } from "next";
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
export const metadata: Metadata = { title: pageName("Нова задача") };

export default async function NewTaskPage() {
  const c = await pageCtx();
  const repo = await firstRepo(db(), c.uid, c.org);
  const ctl = controlKeys(process.env);
  const k = (await ctl?.status())?.providers ?? [];
  const accounts = ((await ctl?.accounts()) ?? []).filter((a) => a.loggedIn);
  return (
    <Shell current="new" waiting={c.waiting}>
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">← Задачи</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Нова задача</h1>
      {!canAct(c.role) ? (
        <p className={`${card} mt-6 p-5 text-sm`}>Само собственик или одобряващ може да дава задачи.</p>
      ) : !repo ? (
        <p className={`${card} mt-6 p-5 text-sm`}>Няма свързано хранилище. Пусни харнеса с <code className="font-mono">pnpm local</code>.</p>
      ) : (
        <NewTaskForm repo={repo} ready={{ anthropic: k.includes("anthropic"), openai: k.includes("openai") }} accounts={accounts} />
      )}
    </Shell>
  );
}
