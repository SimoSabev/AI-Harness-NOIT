"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AGENTS } from "../lib/agents";
import type { AgentId } from "../lib/agents";
import { ERROR_TEXT, postJson } from "../lib/client/api";
import { btn, card, input } from "./ui";

const TYPES = [
  { id: "bugfix", label: "Поправка на бъг" },
  { id: "feature", label: "Нова функция" },
  { id: "docs", label: "Документация" },
  { id: "css", label: "Стилове" },
] as const;

const EXAMPLE = "Отстъпката от 10% трябва да важи за поръчки над 50 лв. Сега не важи. Поправи го.";

// D-292: the one form of the minimal harness. Demo agents first: they work without any key.
export function NewTaskForm({ repo }: { repo: string }) {
  const router = useRouter();
  const [text, setText] = useState(EXAMPLE);
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("bugfix");
  const [agent, setAgent] = useState<AgentId>("fake:delete-test");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ordered = [...AGENTS].sort((a, b) => Number(a.needsKey) - Number(b.needsKey));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await postJson("/api/tasks", { text: text.trim(), type, agent });
    if (r.status === 201 && typeof r.body.id === "string") {
      router.push(`/tasks/${r.body.id}`);
      return;
    }
    setBusy(false);
    setError(ERROR_TEXT[String(r.body.error)] ?? `Задачата не беше създадена (грешка ${r.status}).`);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-6">
      <div className={`${card} space-y-5 p-5`}>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Хранилище: <span className="font-mono text-zinc-900 dark:text-zinc-100">{repo}</span>
        </p>
        <label className="block">
          <span className="text-sm font-medium">Какво да направи агентът</span>
          <textarea className={`${input} mt-1.5 min-h-28`} value={text} onChange={(e) => setText(e.target.value)} required maxLength={4000} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Вид</span>
          <select className={`${input} mt-1.5`} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className={`${card} p-5`}>
        <legend className="sr-only">Агент</legend>
        <p className="text-sm font-medium">Агент</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ordered.map((a) => (
            <label key={a.id} className="flex cursor-pointer gap-3 rounded-lg border border-zinc-200 p-3 transition hover:bg-zinc-50 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800/50">
              <input type="radio" name="agent" value={a.id} checked={agent === a.id} onChange={() => setAgent(a.id)} className="mt-1 accent-zinc-900 dark:accent-white" />
              <span>
                <span className="block text-sm font-medium">
                  {a.label}
                  {a.needsKey && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">нужен ключ</span>}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.ghost} onClick={() => router.push("/")}>Отказ</button>
        <button type="submit" className={btn.primary} disabled={busy || text.trim() === ""}>{busy ? "Създавам…" : "Пусни агента"}</button>
      </div>
    </form>
  );
}
