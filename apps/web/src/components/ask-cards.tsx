"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { btn, card, input } from "./ui";

export interface AskView { id: string; attempt: number; tool: string; reason: string; status: string }

// E8g (v5 p. 4.4, AC-8.1): one card per tool the agent asked for. "Once" = a new attempt with a temporary allow;
// "always" = a tool_permissions row and a new layer C version (a TOTP code when it opens net:* or git push); "deny" closes.
export function AskCards({ taskId, asks, attempt, canDecide }: { taskId: string; asks: AskView[]; attempt: number; canDecide: boolean }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = asks.filter((a) => a.attempt === attempt);
  if (current.length === 0) return null;

  const decide = async (ask: string, decision: "once" | "always" | "deny") => {
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/tasks/${taskId}/asks`, { ask_id: ask, decision, ...(code ? { code } : {}) });
    setBusy(false);
    if (r.status === 403 && r.body.error === "second_factor_required") setNeedCode(true);
    if (r.status >= 300) {
      setError(errorText(t, r));
      return;
    }
    setCode("");
    setNeedCode(false);
    router.refresh();
  };

  return (
    <section aria-labelledby="asks-h" className="mt-5 space-y-3">
      <h2 id="asks-h" className="text-sm font-medium">{t("asks.title")}</h2>
      {current.map((a) => (
        <div key={a.id} className={`${card} p-4`}>
          <p className="font-mono text-sm">{a.tool}</p>
          {a.reason && <p className="mt-1 text-sm text-mute">{a.reason}</p>}
          {a.status !== "pending" ? (
            <p className="mt-2 text-sm text-mute">{t("asks.decided", { status: t(`asks.status.${a.status}` as Key) })}</p>
          ) : canDecide ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btn.primary} disabled={busy} onClick={() => void decide(a.id, "once")}>{t("asks.once")}</button>
              <button type="button" className={btn.secondary} disabled={busy} onClick={() => void decide(a.id, "always")}>{t("asks.always")}</button>
              <button type="button" className={btn.danger} disabled={busy} onClick={() => void decide(a.id, "deny")}>{t("asks.deny")}</button>
            </div>
          ) : null}
        </div>
      ))}
      {needCode && (
        <label className="block max-w-xs">
          <span className="text-sm">{t("asks.code")}</span>
          <input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
    </section>
  );
}
