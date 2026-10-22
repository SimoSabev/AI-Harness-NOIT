"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { csrfToken, errorText, postJson } from "../lib/client/api";
import { btn, card, input } from "./ui";

const ERR: Record<string, Key> = {
  bad_keys: "error.bad_keys",
  proxy_start_failed: "error.proxy_start_failed",
  keys_unavailable: "error.keys_unavailable",
  not_an_owner: "error.keys_not_an_owner",
};

// D-293: the keys go to the proxy and nowhere else; the form clears itself and never shows a key back.
export function KeysForm({ providers, canSet }: { providers: string[]; canSet: boolean }) {
  const router = useRouter();
  const t = useT();
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
    setMsg(r.status === 200 ? { ok: true, text: t("keys.saved") } : { ok: false, text: errorText(t, r, ERR) });
    router.refresh();
  };
  const clear = async () => {
    setBusy(true);
    const r = await fetch("/api/keys", { method: "DELETE", headers: { "x-mandat-csrf": csrfToken() }, credentials: "same-origin" });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: t("keys.removed") } : { ok: false, text: t("error.generic", { status: r.status }) });
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={`${card} mt-6 space-y-5 p-5`} autoComplete="off">
      <label className="block">
        <span className="text-sm font-medium">{t("keys.anthropic")}</span>
        <input className={`${input} mt-1.5 font-mono`} type="password" name="anthropic" autoComplete="off" spellCheck={false} placeholder={providers.includes("anthropic") ? t("keys.isSet") : "sk-ant-…"} value={anthropic} onChange={(e) => setAnthropic(e.target.value)} required disabled={!canSet} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{t("keys.openai")}</span>
        <input className={`${input} mt-1.5 font-mono`} type="password" name="openai" autoComplete="off" spellCheck={false} placeholder={providers.includes("openai") ? t("keys.isSet") : "sk-…"} value={openai} onChange={(e) => setOpenai(e.target.value)} disabled={!canSet} />
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {providers.length > 0 ? <button type="button" className={btn.ghost} disabled={busy || !canSet} onClick={() => void clear()}>{t("keys.remove")}</button> : <span />}
        <button type="submit" className={btn.primary} disabled={busy || !canSet || anthropic.trim() === ""}>{busy ? t("keys.starting") : t("keys.save")}</button>
      </div>
    </form>
  );
}
