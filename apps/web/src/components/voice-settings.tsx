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

// D-556: Settings → Voice — the ElevenLabs key (to the proxy, never shown back) and "Create Jarvis" with a voice id;
// the harness makes the person's agent with its tools, so nobody configures anything at ElevenLabs by hand.
export function VoiceSettings({ isSet, canSet }: { isSet: boolean; canSet: boolean }) {
  const router = useRouter();
  const t = useT();
  const [key, setKey] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/keys/voice", { elevenlabs: key.trim() });
    setBusy(false);
    setKey("");
    setMsg(r.status === 200 ? { ok: true, text: t("voice.settings.keySaved") } : { ok: false, text: errorText(t, r, ERR) });
    router.refresh();
  };
  const removeKey = async () => {
    setBusy(true);
    const r = await fetch("/api/keys/voice", { method: "DELETE", headers: { "x-mandat-csrf": csrfToken() }, credentials: "same-origin" });
    setBusy(false);
    setMsg(r.ok ? null : { ok: false, text: t("error.generic", { status: r.status }) });
    router.refresh();
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/voice/agent", { voice_id: voiceId.trim() });
    setBusy(false);
    setMsg(r.status === 200 ? { ok: true, text: t("voice.settings.created") } : { ok: false, text: t("voice.settings.failed", { error: typeof r.body.error === "string" ? r.body.error : String(r.status) }) });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void saveKey(e)} className={`${card} space-y-4 p-5`} autoComplete="off">
        <label className="block">
          <span className="text-sm font-medium">{t("voice.settings.key")}</span>
          <input className={`${input} mt-1.5 font-mono`} type="password" name="elevenlabs" autoComplete="off" spellCheck={false} placeholder={isSet ? t("keys.isSet") : "sk_…"} value={key} onChange={(e) => setKey(e.target.value)} required disabled={!canSet} />
          <span className="mt-1 block text-xs text-mute">{t("voice.settings.keyHelp")}</span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isSet ? <button type="button" className={btn.ghost} disabled={busy || !canSet} onClick={() => void removeKey()}>{t("voice.settings.removeKey")}</button> : <span />}
          <button type="submit" className={btn.primary} disabled={busy || !canSet || key.trim() === ""}>{t("voice.settings.saveKey")}</button>
        </div>
      </form>
      <form onSubmit={(e) => void create(e)} className={`${card} space-y-4 p-5`} autoComplete="off">
        <label className="block">
          <span className="text-sm font-medium">{t("voice.settings.voiceId")}</span>
          <input className={`${input} mt-1.5 font-mono`} name="voice_id" spellCheck={false} pattern="[A-Za-z0-9_-]{1,64}" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} required disabled={!canSet || !isSet} />
          <span className="mt-1 block text-xs text-mute">{t("voice.settings.voiceIdHelp")}</span>
        </label>
        <div className="flex justify-end">
          <button type="submit" className={btn.primary} disabled={busy || !canSet || !isSet || voiceId.trim() === ""}>{t("voice.settings.create")}</button>
        </div>
      </form>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
