import type { Metadata } from "next";
import { pageName } from "../../lib/brand";
import { KeysForm } from "../../components/keys-form";
import { Shell } from "../../components/shell";
import { StatusBadge, card } from "../../components/ui";
import { controlKeys } from "../../lib/server/keys";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Акаунти") };

// D-293: where the API keys of the real agents go — the proxy only. The agent gets a one-task token, never the key.
export default async function KeysPage() {
  const c = await pageCtx();
  const ctl = controlKeys(process.env);
  const s = (await ctl?.status()) ?? { proxy: "unavailable" as const, providers: [] };
  const accounts = (await ctl?.accounts()) ?? [];
  const row = (label: string, on: boolean) => (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <StatusBadge tone={on ? "green" : "gray"} label={on ? "Готов" : "Няма ключ"} />
    </li>
  );
  return (
    <Shell current="keys" waiting={c.waiting}>
      <h1 className="text-2xl font-semibold tracking-tight">Акаунти</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
        Влез с абонамента си (Claude Pro, Max, Team) — като в Claude Code. Може няколко акаунта; при всяка задача избираш с кой.
      </p>
      <section aria-labelledby="acc-h" className="mt-6">
        <h2 id="acc-h" className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Claude абонаменти</h2>
        {accounts.length > 0 && (
          <ul className={`${card} divide-y divide-zinc-200 dark:divide-zinc-800`}>
            {accounts.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{a.loggedIn ? `${a.email ?? "?"} · ${a.plan ?? "абонамент"}` : "не е влязъл"}</span>
                </span>
                <StatusBadge tone={a.loggedIn ? "green" : "gray"} label={a.loggedIn ? "Готов" : "Не е влязъл"} />
              </li>
            ))}
          </ul>
        )}
        <div className={`${card} ${accounts.length > 0 ? "mt-3" : ""} p-5 text-sm`}>
          <p className="font-medium">{accounts.length > 0 ? "Добави още един акаунт" : "Добави акаунт"}</p>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">В терминал на този компютър (входът минава през страницата на Anthropic; харнесът не вижда паролата и токена):</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs dark:bg-zinc-950">pnpm mandat login --name lichno</pre>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Името е само латински малки букви, цифри и „-“ (напр. <code className="font-mono">lichno</code>, <code className="font-mono">rabota</code>). Махане: <code className="font-mono">pnpm mandat logout --name …</code>. После презареди страницата.</p>
        </div>
      </section>
      <h2 className="mt-10 mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">API ключове (плащане на токен)</h2>
      <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
        Ключът отива само в проксито на харнеса. Не се записва в базата, на диска или в лог, и агентът никога не го вижда.
      </p>
      <ul className={`${card} mt-3 divide-y divide-zinc-200 dark:divide-zinc-800`}>
        {row("Claude Code (Anthropic)", s.providers.includes("anthropic"))}
        {row("Codex (OpenAI)", s.providers.includes("openai"))}
      </ul>
      {s.proxy === "unavailable" ? (
        <p className={`${card} mt-6 p-5 text-sm`}>Ключове се задават, когато харнесът е пуснат с <code className="font-mono">pnpm local</code>.</p>
      ) : (
        <KeysForm providers={s.providers} canSet={c.role === "owner"} />
      )}
    </Shell>
  );
}
