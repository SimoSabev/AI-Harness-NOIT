import type { Metadata } from "next";
import { pageName } from "../../lib/brand";
import { KeysForm } from "../../components/keys-form";
import { Shell } from "../../components/shell";
import { StatusBadge, card } from "../../components/ui";
import { listChannels } from "../../lib/server/channels";
import { db } from "../../lib/server/db";
import { controlKeys } from "../../lib/server/keys";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Акаунти") };

// D-293: where the API keys of the real agents go — the proxy only. The agent gets a one-task token, never the key.
const HEALTH: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  ok: { label: "Работи", tone: "green" },
  degraded: { label: "Влошен", tone: "amber" },
  limited: { label: "Лимит", tone: "red" },
  down: { label: "Недостъпен", tone: "red" },
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });

export default async function KeysPage() {
  const c = await pageCtx();
  const ctl = controlKeys(process.env);
  const s = (await ctl?.status()) ?? { proxy: "unavailable" as const, providers: [] };
  const accounts = (await ctl?.accounts()) ?? [];
  const channels = await listChannels(db(), c.uid, c.org);
  const row = (label: string, on: boolean) => (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <StatusBadge tone={on ? "green" : "gray"} label={on ? "Готов" : "Няма ключ"} />
    </li>
  );
  return (
    <Shell current="keys" waiting={c.waiting}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Акаунти</h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        Влез с абонамента си (Claude Pro, Max, Team) — като в Claude Code. Може няколко акаунта; при всяка задача избираш с кой.
      </p>
      <section aria-labelledby="acc-h" className="mt-6">
        <h2 id="acc-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">Claude абонаменти</h2>
        {accounts.length > 0 && (
          <ul className={`${card} divide-y divide-line`}>
            {accounts.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-mute">{a.loggedIn ? `${a.email ?? "?"} · ${a.plan ?? "абонамент"}` : "не е влязъл"}</span>
                </span>
                <StatusBadge tone={a.loggedIn ? "green" : "gray"} label={a.loggedIn ? "Готов" : "Не е влязъл"} />
              </li>
            ))}
          </ul>
        )}
        <div className={`${card} ${accounts.length > 0 ? "mt-3" : ""} p-5 text-sm`}>
          <p className="font-medium">{accounts.length > 0 ? "Добави още един акаунт" : "Добави акаунт"}</p>
          <p className="mt-1 text-mute">В терминал на този компютър (входът минава през страницата на Anthropic; харнесът не вижда паролата и токена):</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-raised px-3 py-2 font-mono text-xs">pnpm mandat login --name lichno</pre>
          <p className="mt-2 text-xs text-mute">Името е само латински малки букви, цифри и „-“ (напр. <code className="font-mono">lichno</code>, <code className="font-mono">rabota</code>). Махане: <code className="font-mono">pnpm mandat logout --name …</code>. После презареди страницата.</p>
        </div>
      </section>
      <h2 className="mt-10 mb-2 font-display text-sm font-medium tracking-wide text-mute">API ключове (плащане на токен)</h2>
      <p className="max-w-2xl text-sm text-mute">
        Ключът отива само в проксито на харнеса. Не се записва в базата, на диска или в лог, и агентът никога не го вижда.
      </p>
      <ul className={`${card} mt-3 divide-y divide-line`}>
        {row("Claude Code (Anthropic)", s.providers.includes("anthropic"))}
        {row("Codex (OpenAI)", s.providers.includes("openai"))}
      </ul>
      {s.proxy === "unavailable" ? (
        <p className={`${card} mt-6 p-5 text-sm`}>Ключове се задават, когато харнесът е пуснат с <code className="font-mono">pnpm local</code>.</p>
      ) : (
        <KeysForm providers={s.providers} canSet={c.role === "owner"} />
      )}
      {channels.length > 0 && (
        <section aria-labelledby="ch-h" className="mt-10">
          <h2 id="ch-h" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">Канали и лимити</h2>
          <p className="max-w-2xl text-sm text-mute">
            Ако агентът удари лимита (429), задачата прелива към следващия канал (напр. Claude → Codex). Новият агент започва от ниво 0 на стълбата.
          </p>
          <ul className={`${card} mt-3 divide-y divide-line`}>
            {channels.map((ch) => {
              const h = HEALTH[ch.health] ?? { label: ch.health, tone: "gray" as const };
              return (
                <li key={ch.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{ch.label}{ch.enabled ? "" : " (изключен)"}</span>
                    <span className="block text-xs text-mute">
                      {ch.provider} · <span className="font-mono">{ch.model}</span> · днес ${ch.spent_today_usd.toFixed(2)}{ch.budget_usd_day !== null ? ` от $${ch.budget_usd_day.toFixed(2)}` : ""}
                      {ch.limit_resets_at ? ` · лимитът се нулира в ${hhmm(ch.limit_resets_at)}` : ch.cooldown_until ? ` · пауза до ${hhmm(ch.cooldown_until)}` : ""}
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
