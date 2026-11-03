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

// D-440: the Exa key of research goes to the proxy like the model keys; the form clears itself and never shows it back.
export function ResearchKeyForm({ isSet, canSet }: { isSet: boolean; canSet: boolean }) {
  const router = useRouter();
  const t = useT();
  const [exa, setExa] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/keys/research", { exa: exa.trim() });
    setBusy(false);
    setExa("");
    setMsg(r.status === 200 ? { ok: true, text: t("keys.exaSaved") } : { ok: false, text: errorText(t, r, ERR) });
    router.refresh();
  };
  const clear = async () => {
    setBusy(true);
    const r = await fetch("/api/keys/research", { method: "DELETE", headers: { "x-mandat-csrf": csrfToken() }, credentials: "same-origin" });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: t("keys.exaRemoved") } : { ok: false, text: t("error.generic", { status: r.status }) });
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={`${card} mt-3 space-y-5 p-5`} autoComplete="off">
      <label className="block">
        <span className="text-sm font-medium">{t("keys.exa")}</span>
        <input className={`${input} mt-1.5 font-mono`} type="password" name="exa" autoComplete="off" spellCheck={false} placeholder={isSet ? t("keys.isSet") : "exa-…"} value={exa} onChange={(e) => setExa(e.target.value)} required disabled={!canSet} />
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isSet ? <button type="button" className={btn.ghost} disabled={busy || !canSet} onClick={() => void clear()}>{t("keys.exaRemove")}</button> : <span />}
        <button type="submit" className={btn.primary} disabled={busy || !canSet || exa.trim() === ""}>{busy ? t("keys.starting") : t("keys.save")}</button>
      </div>
    </form>
  );
}
