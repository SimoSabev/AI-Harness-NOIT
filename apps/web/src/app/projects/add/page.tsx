import type { Metadata } from "next";
import { LocalPath } from "@mandat/contract";
import { AddProject } from "../../../components/local-access";
import { Shell } from "../../../components/shell";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("add.title")) };
}

// E9g A3 (AC-12.6): "Add project" — a folder dropped on the desktop window, "Open with", or the folder dialog; the
// suggestion; the rights; the grant (confirmed in a native dialog by the desktop app).
export default async function AddProjectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await pageCtx();
  const t = await getT();
  const raw = (await searchParams).path;
  const p = LocalPath.safeParse(typeof raw === "string" ? raw : undefined);
  return (
    <Shell current="harness" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("add.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">{t("add.intro")}</p>
      <AddProject initialPath={p.success ? p.data : null} />
    </Shell>
  );
}
