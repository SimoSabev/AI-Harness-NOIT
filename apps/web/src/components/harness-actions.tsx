"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ERROR_TEXT, postJson } from "../lib/client/api";

// т. 8.2 (7): Свържи (scanner job) and Одобри — owner + a NEW TOTP code at the moment of approving. Never automatic.
const HARNESS_ERRORS: Record<string, string> = {
  ...ERROR_TEXT,
  not_an_owner: "Само собственик може да свързва и одобрява харнеса.",
  blocked_invisible_characters: "Одобрението е блокирано: невидими знаци в съществуващите инструкции.",
  not_proposed: "Предложението вече не чака одобрение.",
  bad_yaml: "Невалиден .mandat.yml.",
  forbidden_command: "Командата не е позволена (|, ;, &&, $(, >, curl, wget, sh -c).",
};

export function HarnessActions({ repoId, proposalId, canApprove }: { repoId: string; proposalId: string | null; canApprove: boolean }) {
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
    <div>
      <div className="actions">
        <button className="btn" type="button" disabled={busy} onClick={() => call(`/api/repos/${repoId}/harness/connect`, {}, "Сканирането е в опашката на worker-а.")}>Свържи</button>
      </div>
      {proposalId && canApprove && (
        <form className="confirm" onSubmit={(e) => (e.preventDefault(), void call(`/api/repos/${repoId}/harness/approve`, { proposal_id: proposalId, generate, code }, "Одобрено. Worker-ът отваря PR чернова."))}>
          <label>
            <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} /> Генерирай AGENTS.md и CLAUDE.md по шаблон
          </label>
          <label>
            Код от приложението (6 цифри)
            <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          <div className="actions">
            <button className="btn primary" type="submit" disabled={busy}>Одобри харнеса</button>
          </div>
        </form>
      )}
      {msg && <p className={msg.error ? "error" : undefined} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}
