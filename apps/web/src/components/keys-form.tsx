"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "../lib/client/api";
import { csrfToken } from "../lib/client/api";
import { btn, card, input } from "./ui";

const ERR: Record<string, string> = {
  bad_keys: "Ключът не изглежда верен (поне 20 знака, без интервали).",
  proxy_start_failed: "Проксито не тръгна. Виж терминала, където пусна pnpm local.",
  keys_unavailable: "Ключове се задават само когато харнесът е пуснат с pnpm local.",
  not_an_owner: "Само собственикът задава ключове.",
};

// D-293: the keys go to the proxy and nowhere else; the form clears itself and never shows a key back.
export function KeysForm({ providers, canSet }: { providers: string[]; canSet: boolean }) {
  const router = useRouter();
  const [anthropic, setAnthropic] = useState("");
  const [openai, setOpenai] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/keys", { anthropic: anthropic.trim(), ...(openai.trim() ? { openai: openai.trim() } : {}) });
    setBusy(false);
    setAnthropic("");
    setOpenai("");
    setMsg(r.status === 200 ? { ok: true, text: "Готово. Проксито работи с новите ключове." } : { ok: false, text: ERR[String(r.body.error)] ?? `Грешка (${r.status}).` });
    router.refresh();
  };
  const clear = async () => {
    setBusy(true);
    const r = await fetch("/api/keys", { method: "DELETE", headers: { "x-mandat-csrf": csrfToken() }, credentials: "same-origin" });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Ключовете са махнати; проксито е спряно." } : { ok: false, text: `Грешка (${r.status}).` });
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={`${card} mt-6 space-y-5 p-5`} autoComplete="off">
      <label className="block">
        <span className="text-sm font-medium">Anthropic API ключ (за Claude Code)</span>
        <input className={`${input} mt-1.5 font-mono`} type="password" name="anthropic" autoComplete="off" spellCheck={false} placeholder={providers.includes("anthropic") ? "зададен — въведи нов, за да го смениш" : "sk-ant-…"} value={anthropic} onChange={(e) => setAnthropic(e.target.value)} required disabled={!canSet} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">OpenAI API ключ (за Codex, по желание)</span>
        <input className={`${input} mt-1.5 font-mono`} type="password" name="openai" autoComplete="off" spellCheck={false} placeholder={providers.includes("openai") ? "зададен — въведи нов, за да го смениш" : "sk-…"} value={openai} onChange={(e) => setOpenai(e.target.value)} disabled={!canSet} />
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {providers.length > 0 ? <button type="button" className={btn.ghost} disabled={busy || !canSet} onClick={() => void clear()}>Махни ключовете</button> : <span />}
        <button type="submit" className={btn.primary} disabled={busy || !canSet || anthropic.trim() === ""}>{busy ? "Пускам проксито…" : "Запази в проксито"}</button>
      </div>
    </form>
  );
}
