"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { useNeedsCode } from "./second-factor";
import { btn, input } from "./ui";

// §8.2 (7) / D-298: Connect (the scanner job) and Approve — owner + a NEW TOTP code at the moment of approving. Never automatic.
const HARNESS_ERRORS: Record<string, Key> = {
  not_an_owner: "error.not_an_owner",
  blocked_invisible_characters: "error.blocked_invisible_characters",
  not_proposed: "error.not_proposed",
  bad_yaml: "error.bad_yaml",
  forbidden_command: "error.forbidden_command",
};

export function HarnessActions({ repoId, proposalId, hasProposal }: { repoId: string; proposalId: string | null; hasProposal: boolean }) {
  const router = useRouter();
  const t = useT();
  const needsCode = useNeedsCode();
  const [code, setCode] = useState("");
  const [generate, setGenerate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const call = async (url: string, body: unknown, ok: string) => {
    setBusy(true);
    setMsg(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (r.status >= 300) setMsg({ text: errorText(t, r, HARNESS_ERRORS), error: true });
    else {
      setMsg({ text: ok, error: false });
      setCode("");
      router.refresh();
    }
  };
  return (
    <div className="space-y-4">
      {proposalId && (
        <form className="space-y-3 rounded-lg border border-line p-4" onSubmit={(e) => (e.preventDefault(), void call(`/api/repos/${repoId}/harness/approve`, { proposal_id: proposalId, generate, ...(code ? { code } : {}) }, t("harness.approved")))}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="accent-[var(--accent)]" />
            {t("harness.generate")}
          </label>
          {needsCode && (
            <label className="block text-sm">
              <span className="font-medium">{t("harness.code")}</span>
              <input className={`${input} mt-1.5 max-w-40 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <button className={btn.primary} type="submit" disabled={busy || (needsCode && code.length !== 6)}>{t("harness.approve")}</button>
        </form>
      )}
      <button className={btn.secondary} type="button" disabled={busy} onClick={() => void call(`/api/repos/${repoId}/harness/connect`, {}, t("harness.scanning"))}>
        {hasProposal ? t("harness.rescan") : t("harness.scan")}
      </button>
      {msg && <p className={`text-sm ${msg.error ? "text-bad" : "text-mute"}`} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}
