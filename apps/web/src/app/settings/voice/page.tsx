import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "../../../components/shell";
import { card } from "../../../components/ui";
import { VoiceSettings } from "../../../components/voice-settings";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { controlKeys } from "../../../lib/server/keys";
import { pageCtx } from "../../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("voice.settings.title")) };
}

// D-556: Settings → Voice — Jarvis's key and agent. Only on `mandat local`: the key goes to its proxy.
export default async function VoicePage() {
  const c = await pageCtx();
  const t = await getT();
  const ctl = controlKeys(process.env);
  const status = ctl ? await ctl.status() : null;
  return (
    <Shell current="settings" waiting={c.waiting}>
      <p className="text-sm"><Link href="/settings" className="text-mute hover:text-ink">{t("settings.title")}</Link></p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{t("voice.settings.title")}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-mute">{t("voice.settings.intro")}</p>
      {status === null ? <p className={`${card} p-5 text-sm text-mute`}>{t("conn.onlyLocal")}</p>
        : <VoiceSettings isSet={status.providers.includes("elevenlabs")} canSet={c.role === "owner"} />}
    </Shell>
  );
}
