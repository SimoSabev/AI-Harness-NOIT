"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import type { TwinView } from "../lib/twin-view";
import { useNeedsCode } from "./second-factor";
import { btn, input } from "./ui";

// D-523 (the owner's twin) on the task card: what the twin would decide and how often it was right; the ONE
// offer to let it decide this kind of task (a second factor where the app asks for one); turning an active rule off.
export function TwinBox({ twin, canAct, waiting }: { twin: TwinView; canAct: boolean; waiting: boolean }) {
  const t = useT();
  const router = useRouter();
  const needsCode = useNeedsCode();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!waiting && !twin.by_twin) return null;

  const send = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    const r = await postJson("/api/twin/rules", { class_key: twin.class_key, accept, ...(accept && needsCode ? { code } : {}) });
    setBusy(false);
    if (r.status >= 300) return setError(errorText(t, r));
    setCode("");
    router.refresh();
  };
  const pct = Math.round(twin.p * 100);
  const guess = twin.predicted === "approved" ? t("twin.would_approve", { pct, n: twin.n }) : twin.predicted === "rejected" ? t("twin.would_reject", { pct, n: twin.n }) : t("twin.abstain", { n: twin.n });

  return (
    <section aria-label={t("twin.title")} className="space-y-2 rounded-xl border border-line px-4 py-3 text-sm">
      <p>{twin.by_twin ? t("twin.by_twin") : guess}</p>
      {twin.scored > 0 && <p className="text-mute">{t("twin.score", { correct: twin.correct, scored: twin.scored })}</p>}
      {twin.rule === "active" && !twin.by_twin && <p className="text-mute">{t("twin.active")}</p>}
      {twin.rule === "off" && <p className="text-mute">{t("twin.off")}</p>}
      {canAct && twin.offer && !twin.policy && <p className="rounded-lg bg-raised p-3">{t("twin.offer_no_policy")}</p>}
      {canAct && twin.offer && twin.policy && (
        <form className="space-y-2 rounded-lg bg-raised p-3" onSubmit={(e) => (e.preventDefault(), void send(true))}>
          <p className="font-medium">{t("twin.offer")}</p>
          {needsCode && (
            <label className="block max-w-xs">
              <span>{t("actions.code")}</span>
              <input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={btn.primary} type="submit" disabled={busy}>{t("twin.yes")}</button>
            <button className={btn.ghost} type="button" disabled={busy} onClick={() => void send(false)}>{t("twin.no")}</button>
          </div>
        </form>
      )}
      {canAct && twin.rule === "active" && <button className={btn.secondary} type="button" disabled={busy} onClick={() => void send(false)}>{t("twin.turn_off")}</button>}
      {error && <p role="alert" className="text-bad">{error}</p>}
    </section>
  );
}
