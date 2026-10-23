"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { AGENTS, agentHint, agentLabel } from "../lib/agents";
import { errorText, postJson } from "../lib/client/api";
import { btn, card, input } from "./ui";

const TYPES = ["free", "feature", "bugfix", "docs", "css"] as const;

// D-292: the one form of the minimal harness. Demo agents first: they work without any key.
export function NewTaskForm({ repo, ready, accounts, initialText }: { repo: string; ready: { anthropic: boolean; openai: boolean }; accounts: { name: string; agent: string; email: string | null; plan: string | null }[]; initialText?: string }) {
  const router = useRouter();
  const t = useT();
  const [text, setText] = useState(() => initialText ?? t("newTask.example"));
  // D-295: the first signed-in subscription account is the default agent (like in other harnesses)
  const [agent, setAgent] = useState<string>(accounts[0]?.agent ?? "fake:delete-test");
  // The type picks the contract's scope from .mandat.yml (paths, tests). A real agent starts without limits (D-360:
  // "free" — the whole repo, tests may change; the judge still runs); the demo agents' scenarios are bug fixes.
  const [type, setType] = useState<(typeof TYPES)[number]>(accounts.length > 0 ? "free" : "bugfix");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ordered: { id: string; label: string; hint: string; needsKey: boolean }[] = [
    ...accounts.map((a) => ({ id: a.agent, label: t("agent.account", { name: a.name }), hint: `${a.email ?? t("agent.subscription")} · ${a.plan ?? t("agent.subscription")}`, needsKey: false })),
    ...[...AGENTS].sort((a, b) => Number(a.needsKey) - Number(b.needsKey)).map((a) => ({ ...a, label: agentLabel(a.id, t.lang), hint: agentHint(a.id, t.lang) })),
  ];
  const hasKey = (id: string) => (id === "claude" ? ready.anthropic : id === "codex" ? ready.openai : true);

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
    setError(errorText(t, r, {}, t("newTask.failed", { status: r.status })));
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-6">
      <div className={`${card} space-y-5 p-5`}>
        <p className="text-sm text-mute">
          {t("newTask.repo")} <span className="font-mono text-ink">{repo}</span>
        </p>
        <label className="block">
          <span className="text-sm font-medium">{t("newTask.what")}</span>
          <textarea className={`${input} mt-1.5 min-h-28`} value={text} onChange={(e) => setText(e.target.value)} required maxLength={4000} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("newTask.type")}</span>
          <select className={`${input} mt-1.5`} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {TYPES.map((x) => (
              <option key={x} value={x}>{t(`newTask.type.${x}`)}</option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-mute">
            {t(`newTask.scope.${type}`)} <a href="/harness" className="underline">{t("newTask.scopeChange")}</a>
          </span>
        </label>
      </div>

      <fieldset className={`${card} p-5`}>
        <legend className="sr-only">{t("newTask.agent")}</legend>
        <p className="text-sm font-medium">{t("newTask.agent")}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ordered.map((a) => (
            <label key={a.id} className="flex cursor-pointer gap-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 rounded-lg border border-line p-3 transition hover:bg-raised has-[:checked]:border-accent-text has-[:checked]:bg-accent-soft">
              <input type="radio" name="agent" value={a.id} checked={agent === a.id} onChange={() => setAgent(a.id)} disabled={!hasKey(a.id)} className="mt-1 accent-[var(--accent)]" />
              <span>
                <span className="block text-sm font-medium">
                  {a.label}
                  {a.needsKey && (hasKey(a.id)
                    ? <span className="ml-2 rounded bg-ok-soft px-1.5 py-0.5 text-xs font-normal text-ok">{t("newTask.keySet")}</span>
                    : <a href="/keys" className="ml-2 rounded bg-raised px-1.5 py-0.5 text-xs font-normal text-ink underline">{t("newTask.setKey")}</a>)}
                  {a.id.startsWith("claude@") && <span className="ml-2 rounded bg-ok-soft px-1.5 py-0.5 text-xs font-normal text-ok">{t("agent.subscription")}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-mute">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.ghost} onClick={() => router.push("/")}>{t("newTask.cancel")}</button>
        <button type="submit" className={btn.primary} disabled={busy || text.trim() === ""}>{busy ? t("newTask.creating") : t("newTask.run")}</button>
      </div>
    </form>
  );
}
