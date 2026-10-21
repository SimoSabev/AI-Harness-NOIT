"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ERROR_TEXT, postJson } from "../lib/client/api";
import type { StatusKey } from "../lib/status";
import { btn, input } from "./ui";

// D-292: the decision for the status the task is in. Approve/reject is one click + confirm (a fresh TOTP code only
// when the change asks for a second factor); retry for a failure; stop while it runs. Errors are announced (role=alert).
export function TaskActions(p: { taskId: string; status: StatusKey; canAct: boolean; changesetId: string | null; headSha: string | null; twoFactor: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | "approved" | "rejected">(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!p.canAct) return null;

  const run = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (r.status >= 300) {
      setError(ERROR_TEXT[String(r.body.error)] ?? `Грешка (${r.status}).`);
      return;
    }
    setConfirm(null);
    setCode("");
    router.refresh();
  };
  const decide = (decision: "approved" | "rejected") =>
    run(`/api/changesets/${p.changesetId}/approve`, { head_sha: p.headSha, decision, client: "web", ...(decision === "approved" && p.twoFactor ? { code } : {}) });

  const canDecide = p.status === "review" && p.changesetId !== null && p.headSha !== null;
  const canRetry = p.status === "failed" || p.status === "unknown" || p.status === "empty" || p.status === "key";
  const canStop = p.status === "queued" || p.status === "running" || p.status === "checking";
  if (!canDecide && !canRetry && !canStop) return null;

  return (
    <div className="space-y-3">
      {!confirm && (
        <div className="flex flex-wrap gap-2">
          {canDecide && <button className={btn.primary} type="button" disabled={busy} onClick={() => setConfirm("approved")}>Одобри промяната</button>}
          {canDecide && <button className={btn.danger} type="button" disabled={busy} onClick={() => setConfirm("rejected")}>Отхвърли</button>}
          {canRetry && <button className={btn.primary} type="button" disabled={busy} onClick={() => void run(`/api/tasks/${p.taskId}/retry`, {})}>Пусни отново</button>}
          {canStop && <button className={btn.secondary} type="button" disabled={busy} onClick={() => void run(`/api/tasks/${p.taskId}/stop`, {})}>Спри</button>}
        </div>
      )}
      {confirm && (
        <form className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950" onSubmit={(e) => (e.preventDefault(), void decide(confirm))}>
          <p className="text-sm font-medium">{confirm === "approved" ? "Одобряваш тази промяна?" : "Отхвърляш тази промяна?"}</p>
          {confirm === "approved" && p.twoFactor && (
            <label className="mt-3 block max-w-xs">
              <span className="text-sm">Код от приложението (6 цифри)</span>
              <input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button className={confirm === "approved" ? btn.primary : btn.danger} type="submit" disabled={busy}>{confirm === "approved" ? "Да, одобри" : "Да, отхвърли"}</button>
            <button className={btn.ghost} type="button" onClick={() => setConfirm(null)}>Назад</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
    </div>
  );
}
