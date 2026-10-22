"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import { btn, input } from "./ui";

// E8g (v5 p. 4.4 (3), AC-8.5): "Steer" — a short note to the agent while it works. Claude Code takes it live (stream-json
// on stdin); Codex cannot, so the box is replaced by an explanation; a note always reaches the next attempt's contract.
export function SteerBox({ taskId, live, codex }: { taskId: string; live: boolean; codex: boolean }) {
  const router = useRouter();
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (codex) return <p className="mt-4 text-sm text-mute">{t("steer.codex")}</p>;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson(`/api/tasks/${taskId}/steer`, { text });
    setBusy(false);
    if (r.status !== 200) {
      setMsg({ ok: false, text: errorText(t, r) });
      return;
    }
    setText("");
    setMsg({ ok: true, text: r.body.live === true ? t("steer.sentLive") : t("steer.sentLater") });
    router.refresh();
  };
  return (
    <form onSubmit={(e) => void send(e)} className="mt-4 space-y-2" aria-labelledby="steer-h">
      <h2 id="steer-h" className="text-sm font-medium">{t("steer.title")}</h2>
      {!live && <p className="text-xs text-mute">{t("steer.notLive")}</p>}
      <div className="flex gap-2">
        <input className={`${input} flex-1`} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={t("steer.placeholder")} aria-label={t("steer.note")} />
        <button type="submit" className={btn.secondary} disabled={busy || text.trim() === ""}>{t("steer.send")}</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </form>
  );
}
