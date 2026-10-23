"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import type { Tone } from "../lib/status";
import { Hex, btn } from "./ui";

// The workspace's left column (the tasks, like the chats of an assistant) and the empty state: one box to start a task.
export interface WsTask { id: string; text: string; tone: Tone; label: string; ago: string }
export interface WsAgent { id: string; label: string; hint: string; ready: boolean }

export function TaskList({ tasks, selected }: { tasks: WsTask[]; selected: string | null }) {
  const t = useT();
  return (
    <nav aria-label={t("ws.tasks")} className="flex min-h-0 flex-col gap-2">
      <Link href="/" className={`${btn.secondary} justify-start`} aria-current={selected === null ? "page" : undefined}>+ {t("ws.new")}</Link>
      <p className="px-2 pt-2 font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">{t("ws.tasks")}</p>
      {tasks.length === 0 && <p className="px-2 text-sm text-mute">{t("ws.noTasks")}</p>}
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {tasks.map((x) => (
          <li key={x.id}>
            <Link href={`/?task=${x.id}`} aria-current={selected === x.id ? "page" : undefined}
              className="flex items-start gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-raised aria-[current=page]:bg-accent-soft">
              <Hex tone={x.tone} className="mt-1.5 h-2 w-2.5" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2">{x.text}</span>
                <span className="block text-[11px] text-mute">{x.label} · {x.ago}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const TYPES = ["free", "feature", "bugfix", "docs", "css"] as const;

export function NewTask({ agents, repo, canAct }: { agents: WsAgent[]; repo: string | null; canAct: boolean }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState("");
  const [agent, setAgent] = useState(agents[0]?.id ?? "fake:honest-fix");
  const [type, setType] = useState<(typeof TYPES)[number]>(agent.startsWith("fake") ? "bugfix" : "free");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = (id: string) => {
    setAgent(id);
    setType(id.startsWith("fake") ? "bugfix" : "free");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return setError(t("ws.ask"));
    setBusy(true);
    setError(null);
    const r = await postJson("/api/tasks", { text: text.trim(), type, agent });
    if (r.status === 201 && typeof r.body.id === "string") return router.push(`/?task=${r.body.id}`);
    setBusy(false);
    setError(errorText(t, r, {}, t("newTask.failed", { status: r.status })));
  };
  if (!canAct) return <p className="m-auto text-sm text-mute">{t("newTask.onlyApprovers")}</p>;
  return (
    <form onSubmit={submit} className="m-auto flex w-full max-w-2xl flex-col gap-4 py-10">
      <h1 className="text-center font-display text-3xl font-semibold tracking-tight">{t("ws.ask")}</h1>
      <p className="text-center text-sm text-mute">{t("ws.askHint")}</p>
      <div className="rounded-2xl border border-line-strong bg-panel p-3 focus-within:border-accent-text">
        <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={4} maxLength={4000} aria-label={t("newTask.what")} placeholder={t("ws.placeholder")} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          className="w-full resize-none bg-transparent px-1 text-[15px] outline-none placeholder:text-mute" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-mute">
            {t("ws.agent")}
            <select value={agent} onChange={(e) => pick(e.target.value)} className="rounded-lg border border-line bg-canvas px-2 py-1 text-sm text-ink">
              {agents.map((a) => <option key={a.id} value={a.id} disabled={!a.ready}>{a.label}{a.ready ? "" : ` (${t("newTask.setKey")})`}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-mute">
            {t("ws.scope")}
            <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])} className="rounded-lg border border-line bg-canvas px-2 py-1 text-sm text-ink">
              {TYPES.map((x) => <option key={x} value={x}>{t(`newTask.type.${x}`)}</option>)}
            </select>
          </label>
          <button type="submit" className={`${btn.primary} ml-auto`} disabled={busy}>{busy ? t("ws.sending") : t("ws.send")}</button>
        </div>
      </div>
      <p className="text-center text-xs text-mute">{repo ? <>{t("newTask.repo")} <span className="font-mono">{repo}</span> · {agents.find((a) => a.id === agent)?.hint}</> : null}</p>
      {error && <p role="alert" className="text-center text-sm text-bad">{error}</p>}
    </form>
  );
}
