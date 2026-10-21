"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ERROR_TEXT, postJson } from "../lib/client/api";
import { btn, input } from "./ui";

// т. 8.2 (7) / D-298: Свържи (the scanner job) and Одобри — owner + a NEW TOTP code at the moment of approving. Never automatic.
const HARNESS_ERRORS: Record<string, string> = {
  ...ERROR_TEXT,
  not_an_owner: "Само собственик може да свързва и одобрява правилата.",
  blocked_invisible_characters: "Одобрението е блокирано: невидими знаци в съществуващите инструкции.",
  not_proposed: "Предложението вече не чака одобрение.",
  bad_yaml: "Невалиден .mandat.yml.",
  forbidden_command: "Командата не е позволена (|, ;, &&, $(, >, curl, wget, sh -c).",
};

export function HarnessActions({ repoId, proposalId, hasProposal }: { repoId: string; proposalId: string | null; hasProposal: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [generate, setGenerate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const call = async (url: string, body: unknown, ok: string) => {
    setBusy(true);
    setMsg(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (r.status >= 300) setMsg({ text: HARNESS_ERRORS[String(r.body.error)] ?? `Грешка (${r.status}).`, error: true });
    else {
      setMsg({ text: ok, error: false });
      setCode("");
      router.refresh();
    }
  };
  return (
    <div className="space-y-4">
      {proposalId && (
        <form className="space-y-3 rounded-lg border border-line p-4" onSubmit={(e) => (e.preventDefault(), void call(`/api/repos/${repoId}/harness/approve`, { proposal_id: proposalId, generate, code }, "Одобрено. Правилата важат за следващите задачи."))}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="accent-[var(--accent)]" />
            Генерирай и AGENTS.md и CLAUDE.md (инструкциите за агента) по шаблон
          </label>
          <label className="block text-sm">
            <span className="font-medium">Код от приложението за кодове (6 цифри)</span>
            <input className={`${input} mt-1.5 max-w-40 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button className={btn.primary} type="submit" disabled={busy || code.length !== 6}>Одобри правилата</button>
        </form>
      )}
      <button className={btn.secondary} type="button" disabled={busy} onClick={() => void call(`/api/repos/${repoId}/harness/connect`, {}, "Сканирам репото… Обнови след няколко секунди.")}>
        {hasProposal ? "Сканирай пак" : "Сканирай репото"}
      </button>
      {msg && <p className={`text-sm ${msg.error ? "text-bad" : "text-mute"}`} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}
