import type { Metadata } from "next";
import { rich } from "../../i18n/rich";
import { getT } from "../../i18n/server";
import type { Key } from "../../i18n/t";
import { pageName } from "../../lib/brand";
import { KeysForm } from "../../components/keys-form";
import { Shell } from "../../components/shell";
import { StatusBadge, card } from "../../components/ui";
import { listChannels } from "../../lib/server/channels";
import { db } from "../../lib/server/db";
import { controlKeys } from "../../lib/server/keys";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("keys.title")) };
}

// D-293: where the API keys of the real agents go — the proxy only. The agent gets a one-task token, never the key.
const HEALTH: Record<string, { label: Key; tone: "green" | "amber" | "red" | "gray" }> = {
  ok: { label: "keys.health.ok", tone: "green" },
  degraded: { label: "keys.health.degraded", tone: "amber" },
  limited: { label: "keys.health.limited", tone: "red" },
  down: { label: "keys.health.down", tone: "red" },
};
const hhmm = (iso: string, locale: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });

export default async function KeysPage() {
  const c = await pageCtx();
  const t = await getT();
  const ctl = controlKeys(process.env);
  const s = (await ctl?.status()) ?? { proxy: "unavailable" as const, providers: [] };
  const accounts = (await ctl?.accounts()) ?? [];
  const channels = await listChannels(db(), c.uid, c.org);
  const row = (label: string, on: boolean) => (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <StatusBadge tone={on ? "green" : "gray"} label={on ? t("keys.ready") : t("keys.noKey")} />
    </li>
  );
  return (
    <Shell current="keys" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("keys.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        {t("keys.intro")}
      </p>
      <section aria-labelledby="acc-h" className="mt-6">
        <h2 id="acc-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{t("keys.subscriptions")}</h2>
        {accounts.length > 0 && (
          <ul className={`${card} divide-y divide-line`}>
            {accounts.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-mute">{a.loggedIn ? `${a.email ?? "?"} · ${a.plan ?? t("agent.subscription")}` : t("keys.notSignedIn")}</span>
                </span>
                <StatusBadge tone={a.loggedIn ? "green" : "gray"} label={a.loggedIn ? t("keys.ready") : t("keys.notSignedInBadge")} />
              </li>
            ))}
          </ul>
        )}
        <div className={`${card} ${accounts.length > 0 ? "mt-3" : ""} p-5 text-sm`}>
          <p className="font-medium">{accounts.length > 0 ? t("keys.addAnother") : t("keys.add")}</p>
          <p className="mt-1 text-mute">{t("keys.addHint")}</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-raised px-3 py-2 font-mono text-xs">pnpm mandat login --name {t("keys.exampleName")}</pre>
          <p className="mt-2 text-xs text-mute">{rich(t("keys.nameHint"), { a: <code className="font-mono">{t("keys.exampleName")}</code>, b: <code className="font-mono">{t("keys.exampleName2")}</code>, cmd: <code className="font-mono">pnpm mandat logout --name …</code> })}</p>
        </div>
      </section>
      <h2 className="mt-10 mb-2 font-display text-sm font-medium tracking-wide text-mute">{t("keys.api")}</h2>
      <p className="max-w-2xl text-sm text-mute">
        {t("keys.apiHint")}
      </p>
      <ul className={`${card} mt-3 divide-y divide-line`}>
        {row("Claude Code (Anthropic)", s.providers.includes("anthropic"))}
        {row("Codex (OpenAI)", s.providers.includes("openai"))}
      </ul>
      {s.proxy === "unavailable" ? (
        <p className={`${card} mt-6 p-5 text-sm`}>{rich(t("keys.onlyLocal"), { cmd: <code className="font-mono">pnpm local</code> })}</p>
      ) : (
        <KeysForm providers={s.providers} canSet={c.role === "owner"} />
      )}
      {channels.length > 0 && (
        <section aria-labelledby="ch-h" className="mt-10">
          <h2 id="ch-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{t("keys.channels")}</h2>
          <p className="max-w-2xl text-sm text-mute">
            {t("keys.channelsHint")}
          </p>
          <ul className={`${card} mt-3 divide-y divide-line`}>
            {channels.map((ch) => {
              const known = HEALTH[ch.health];
              const h = known ? { label: t(known.label), tone: known.tone } : { label: ch.health, tone: "gray" as const };
              return (
                <li key={ch.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{ch.label}{ch.enabled ? "" : t("keys.off")}</span>
                    <span className="block text-xs text-mute">
                      {ch.provider} · <span className="font-mono">{ch.model}</span> · {t("keys.today", { spent: t.usd(ch.spent_today_usd) })}{ch.budget_usd_day !== null ? t("keys.ofBudget", { budget: t.usd(ch.budget_usd_day) }) : ""}
                      {ch.limit_resets_at ? t("keys.resets", { time: hhmm(ch.limit_resets_at, t.locale) }) : ch.cooldown_until ? t("keys.paused", { time: hhmm(ch.cooldown_until, t.locale) }) : ""}
                    </span>
                  </span>
                  <StatusBadge tone={h.tone} label={h.label} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Shell>
  );
}
