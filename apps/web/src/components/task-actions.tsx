"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import type { StatusKey } from "../lib/status";
import { btn, input } from "./ui";

// D-292: the decision for the status the task is in. Approve/reject is one click + confirm (a fresh TOTP code only
// when the change asks for a second factor); retry for a failure; stop while it runs. Errors are announced (role=alert).
export function TaskActions(p: { taskId: string; status: StatusKey; canAct: boolean; changesetId: string | null; headSha: string | null; twoFactor: boolean }) {
  const router = useRouter();
  const t = useT();
  const [confirm, setConfirm] = useState<null | "approved" | "rejected">(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<string | null>(null);
  if (!p.canAct) return null;

  const run = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (r.status >= 300) {
      setError(errorText(t, r));
      return;
    }
    setConfirm(null);
    setCode("");
    router.refresh();
  };
  const decide = (decision: "approved" | "rejected") =>
    run(`/api/changesets/${p.changesetId}/approve`, { head_sha: p.headSha, decision, client: "web", ...(decision === "approved" && p.twoFactor ? { code } : {}) });

  const canDecide = p.status === "review" && p.changesetId !== null && p.headSha !== null;
  const canRetry = p.status === "failed" || p.status === "unknown" || p.status === "empty" || p.status === "key" || p.status === "base";
  const canFixCi = p.status === "ci";
  const canComments = p.status === "review" || p.status === "ci";
  const canStop = p.status === "queued" || p.status === "running" || p.status === "checking";
  if (!canDecide && !canRetry && !canStop && !canFixCi && !canComments) return null;

  return (
    <div className="space-y-3">
      {!confirm && (
        <div className="flex flex-wrap gap-2">
          {canDecide && <button className={btn.primary} type="button" disabled={busy} onClick={() => setConfirm("approved")}>{t("actions.approve")}</button>}
          {canDecide && <button className={btn.danger} type="button" disabled={busy} onClick={() => setConfirm("rejected")}>{t("actions.reject")}</button>}
          {canRetry && <button className={btn.primary} type="button" disabled={busy} onClick={() => void run(`/api/tasks/${p.taskId}/retry`, {})}>{t("actions.retry")}</button>}
          {canFixCi && <button className={btn.primary} type="button" disabled={busy} onClick={() => void run(`/api/tasks/${p.taskId}/fix-ci`, {})}>{t("actions.fixCi")}</button>}
          {canComments && comments === null && <button className={btn.ghost} type="button" disabled={busy} onClick={() => setComments("")}>{t("actions.applyComments")}</button>}
          {canStop && <button className={btn.secondary} type="button" disabled={busy} onClick={() => void run(`/api/tasks/${p.taskId}/stop`, {})}>{t("actions.stop")}</button>}
        </div>
      )}
      {confirm && (
        <form className="rounded-lg border border-line bg-raised p-4" onSubmit={(e) => (e.preventDefault(), void decide(confirm))}>
          <p className="text-sm font-medium">{confirm === "approved" ? t("actions.confirmApprove") : t("actions.confirmReject")}</p>
          {confirm === "approved" && p.twoFactor && (
            <label className="mt-3 block max-w-xs">
              <span className="text-sm">{t("actions.code")}</span>
              <input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button className={confirm === "approved" ? btn.primary : btn.danger} type="submit" disabled={busy}>{confirm === "approved" ? t("actions.yesApprove") : t("actions.yesReject")}</button>
            <button className={btn.ghost} type="button" onClick={() => setConfirm(null)}>{t("actions.back")}</button>
          </div>
        </form>
      )}
      {comments !== null && (
        <form className="rounded-lg border border-line bg-raised p-4" onSubmit={(e) => (e.preventDefault(), void run(`/api/tasks/${p.taskId}/apply-comments`, { text: comments }).then(() => setComments(null)))}>
          <label className="block text-sm">{t("actions.commentsLabel")}
            <textarea className={`${input} mt-1 h-24`} maxLength={500} required value={comments} onChange={(e) => setComments(e.target.value)} />
          </label>
          <div className="mt-3 flex gap-2">
            <button className={btn.primary} type="submit" disabled={busy || comments.trim() === ""}>{t("actions.applyComments")}</button>
            <button className={btn.ghost} type="button" onClick={() => setComments(null)}>{t("actions.back")}</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
    </div>
  );
}
