"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ERROR_TEXT, postJson } from "../lib/client/api";

// Ф4: ONE primary button by state + the secondary ones in a menu. Approval: a confirmation screen (tap) or a fresh
// TOTP code at the moment of approving (S08); errors are announced (role=alert).
export function TaskActions(p: {
  taskId: string; primary: "approve" | "retry" | "open_pr" | "view"; primaryLabel: string; canAct: boolean; changesetId: string | null; headSha: string | null;
  twoFactor: boolean; prNumber: number | null; verdictId: string | null; retryable: boolean; stoppable: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | "approved" | "rejected">(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const prUrl = p.prNumber !== null ? `https://github.com/${process.env.NEXT_PUBLIC_GITHUB_DEMO_REPO ?? "mandat-demo/shop"}/pull/${p.prNumber}` : null;
  const primary =
    p.primary === "approve" && p.canAct && p.changesetId && p.headSha ? (
      <button className="btn primary" type="button" disabled={busy} onClick={() => setConfirm("approved")}>{p.primaryLabel}</button>
    ) : p.primary === "retry" && p.canAct && p.retryable ? (
      <button className="btn primary" type="button" disabled={busy} onClick={() => run(`/api/tasks/${p.taskId}/retry`, {})}>{p.primaryLabel}</button>
    ) : p.primary === "open_pr" && prUrl ? (
      <a className="btn primary" href={prUrl} rel="noreferrer">{p.primaryLabel}</a>
    ) : (
      <Link className="btn primary" href={`/tasks/${p.taskId}`}>Виж</Link>
    );

  return (
    <div>
      <div className="actions">
        {primary}
        {p.canAct && (
          <details>
            <summary className="btn" aria-label="Още действия">⋯</summary>
            <div className="menu">
              <Link className="btn" href={`/tasks/${p.taskId}`}>Виж</Link>
              {p.changesetId && p.headSha && p.primary === "approve" && <button className="btn" type="button" onClick={() => setConfirm("rejected")}>Откажи</button>}
              {p.retryable && p.primary !== "retry" && <button className="btn" type="button" onClick={() => run(`/api/tasks/${p.taskId}/retry`, {})}>Повтори</button>}
              {p.stoppable && <button className="btn" type="button" onClick={() => run(`/api/tasks/${p.taskId}/stop`, {})}>Спри</button>}
              {p.verdictId && <button className="btn" type="button" onClick={() => run(`/api/verdicts/${p.verdictId}/failure-label`, { layer: "agent", label: "отбелязано от човек" })}>Слой: агент</button>}
            </div>
          </details>
        )}
      </div>
      {confirm && (
        <form className="confirm" onSubmit={(e) => (e.preventDefault(), void decide(confirm))}>
          <p>{confirm === "approved" ? "Потвърди одобрението на тази промяна." : "Потвърди отказа."}</p>
          {confirm === "approved" && p.twoFactor && (
            <label>
              Код от приложението (6 цифри)
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <div className="actions">
            <button className="btn primary" type="submit" disabled={busy}>{confirm === "approved" ? "Одобри" : "Откажи"}</button>
            <button className="btn" type="button" onClick={() => setConfirm(null)}>Назад</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
