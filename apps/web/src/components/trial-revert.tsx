"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { useNeedsCode } from "./second-factor";
import { btn, input } from "./ui";

const ERR: Record<string, Key> = {
  second_factor_required: "error.second_factor_required",
  second_factor_invalid: "error.second_factor_invalid",
  second_factor_rejected: "error.second_factor_rejected",
};

// D-650: one button reverts a change learning applied by itself. Reverting a flaky test or an allowed tool only narrows
// (no code); reverting a narrowing widens again, so it asks for a fresh authenticator code.
export function TrialRevert({ trialId, widens }: { trialId: string; widens: boolean }) {
  const router = useRouter();
  const t = useT();
  const needsCode = useNeedsCode() && widens;
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const revert = async () => {
    setMsg(null);
    const r = await postJson(`/api/profile-trials/${trialId}/revert`, code ? { code } : {});
    if (r.status >= 300) setMsg({ text: errorText(t, r, ERR), error: true });
    else {
      setMsg({ text: t("evolve.reverted", { v: Number(r.body.version) }), error: false });
      setCode("");
      router.refresh();
    }
  };
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      {needsCode && (
        <label className="text-xs">
          <span className="sr-only">{t("profile.code")}</span>
          <input className={`${input} max-w-28 font-mono tracking-widest`} placeholder={t("profile.code")} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
      <button type="button" className={btn.secondary} disabled={needsCode && code.length !== 6} onClick={() => void revert()}>
        {t("evolve.revert")}
      </button>
      {msg && <p role="status" className={`text-xs ${msg.error ? "text-bad" : "text-ok"}`}>{msg.text}</p>}
    </div>
  );
}
