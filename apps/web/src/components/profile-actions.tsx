"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { btn, input } from "./ui";

const ERR: Record<string, Key> = {
  second_factor_required: "error.second_factor_required",
  second_factor_invalid: "error.second_factor_invalid",
  second_factor_rejected: "error.second_factor_rejected",
};

// E8b: approve the proposed profile version or roll back to an earlier one — both with a fresh authenticator code.
export function ProfileActions({ repoId, proposedId, versions }: { repoId: string; proposedId: string | null; versions: number[] }) {
  const router = useRouter();
  const t = useT();
  const [code, setCode] = useState("");
  const [to, setTo] = useState(versions[0] !== undefined ? String(versions[0]) : "");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const call = async (url: string, body: Record<string, unknown>, ok: (v: number) => string) => {
    setMsg(null);
    const r = await postJson(url, { ...body, code });
    if (r.status >= 300) setMsg({ text: errorText(t, r, ERR), error: true });
    else {
      setMsg({ text: ok(Number(r.body.version)), error: false });
      setCode("");
      router.refresh();
    }
  };
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-line p-4">
      <label className="block text-sm">
        <span className="font-medium">{t("profile.code")}</span>
        <input className={`${input} mt-1.5 max-w-40 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        {proposedId && (
          <button type="button" className={btn.primary} disabled={code.length !== 6} onClick={() => void call(`/api/repos/${repoId}/profile/approve`, { profile_id: proposedId }, (v) => t("profile.approved", { v }))}>
            {t("profile.approve")}
          </button>
        )}
        {versions.length > 0 && (
          <span className="flex items-end gap-2">
            <label className="text-sm">
              <span className="sr-only">{t("profile.rollback")}</span>
              <select className={`${input} w-24`} value={to} onChange={(e) => setTo(e.target.value)}>
                {versions.map((v) => (
                  <option key={v} value={String(v)}>{v}</option>
                ))}
              </select>
            </label>
            <button type="button" className={btn.secondary} disabled={code.length !== 6 || to === ""} onClick={() => void call(`/api/repos/${repoId}/profile/rollback`, { version: Number(to) }, (v) => t("profile.rolledBack", { v }))}>
              {t("profile.rollback")}
            </button>
          </span>
        )}
      </div>
      {msg && <p role="status" className={`text-sm ${msg.error ? "text-bad" : "text-ok"}`}>{msg.text}</p>}
    </div>
  );
}
