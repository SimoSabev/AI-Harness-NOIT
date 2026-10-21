import type { Metadata } from "next";
import { KeysForm } from "../../components/keys-form";
import { Shell } from "../../components/shell";
import { StatusBadge, card } from "../../components/ui";
import { controlKeys } from "../../lib/server/keys";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ключове · Мандат" };

// D-293: where the API keys of the real agents go — the proxy only. The agent gets a one-task token, never the key.
export default async function KeysPage() {
  const c = await pageCtx();
  const s = (await controlKeys(process.env)?.status()) ?? { proxy: "unavailable" as const, providers: [] };
  const row = (label: string, on: boolean) => (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <StatusBadge tone={on ? "green" : "gray"} label={on ? "Готов" : "Няма ключ"} />
    </li>
  );
  return (
    <Shell current="keys" waiting={c.waiting}>
      <h1 className="text-2xl font-semibold tracking-tight">Ключове</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
        Ключът отива само в проксито на Мандат. Не се записва в базата, на диска или в лог, и агентът никога не го вижда: получава
        еднократен токен само за своята задача. При рестарт на Docker ключът трябва да се въведе пак.
      </p>
      <ul className={`${card} mt-6 divide-y divide-zinc-200 dark:divide-zinc-800`}>
        {row("Claude Code (Anthropic)", s.providers.includes("anthropic"))}
        {row("Codex (OpenAI)", s.providers.includes("openai"))}
      </ul>
      {s.proxy === "unavailable" ? (
        <p className={`${card} mt-6 p-5 text-sm`}>Ключове се задават, когато Мандат е пуснат с <code className="font-mono">pnpm local</code>.</p>
      ) : (
        <KeysForm providers={s.providers} canSet={c.role === "owner"} />
      )}
    </Shell>
  );
}
