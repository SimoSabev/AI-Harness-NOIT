"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import { actionsOf } from "../lib/status";
import type { StatusKey } from "../lib/status";
import { useNeedsCode } from "./second-factor";
import { btn, input } from "./ui";

// D-292: the decision for the status the task is in. Approve/reject is one click + confirm (a fresh TOTP code only
// when the change asks for a second factor); stop while it runs. Errors are announced (role=alert).
// D-386: after a failure "Run again" takes an optional note to the agent; a change waiting for approval can be sent
// back with a note. A note starts a new attempt with it (apply-comments: the worker hands it to the agent).
export function TaskActions(p: { taskId: string; status: StatusKey; canAct: boolean; changesetId: string | null; headSha: string | null; twoFactor: boolean }) {
  const router = useRouter();
  const t = useT();
  const needsCode = useNeedsCode() && p.twoFactor;
  const [confirm, setConfirm] = useState<null | "approved" | "rejected">(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  if (!p.canAct) return null;

  const run = async (url: string, body: unknown): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (r.status >= 300) {
      setError(errorText(t, r));
      return false;
    }
    setConfirm(null);
    setCode("");
    router.refresh();
    return true;
  };
  const decide = (decision: "approved" | "rejected") =>
    run(`/api/changesets/${p.changesetId}/approve`, { head_sha: p.headSha, decision, client: "web", ...(decision === "approved" && needsCode ? { code } : {}) });

  const a = actionsOf(p.status);
  const canDecide = a.decide && p.changesetId !== null && p.headSha !== null;
  if (!canDecide && !a.again && !a.stop && !a.fixCi && !a.note) return null;
  const again = () => void (note.trim() ? run(`/api/tasks/${p.taskId}/apply-comments`, { text: note.trim() }) : run(`/api/tasks/${p.taskId}/retry`, {})).then((ok) => ok && setNote(""));
  const sendBack = (e: React.FormEvent) => (e.preventDefault(), void run(`/api/tasks/${p.taskId}/apply-comments`, { text: note.trim() }).then((ok) => ok && (setNote(""), setNoteOpen(false))));
  const noteBox = (
    <label className="block text-sm">
      {t("actions.note")}
      <textarea className={`${input} mt-1 h-20`} maxLength={500} placeholder={t("actions.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
    </label>
  );

  return (
    <div className="space-y-3">
      {a.again && a.note && !confirm && noteBox}
      {!confirm && (
        <div className="flex flex-wrap gap-2">
          {canDecide && <button className={btn.primary} type="button" data-desktop-approve="" disabled={busy} onClick={() => setConfirm("approved")}>{t("actions.approve")}</button>}
          {canDecide && <button className={btn.danger} type="button" disabled={busy} onClick={() => setConfirm("rejected")}>{t("actions.reject")}</button>}
          {a.again && <button className={btn.primary} type="button" disabled={busy} onClick={again}>{t("actions.retry")}</button>}
          {a.fixCi && <button className={btn.primary} type="button" disabled={busy} onClick={() => void run(`/api/tasks/${p.taskId}/fix-ci`, {})}>{t("actions.fixCi")}</button>}
          {a.note && !a.again && !noteOpen && <button className={btn.ghost} type="button" disabled={busy} onClick={() => setNoteOpen(true)}>{t("actions.sendBack")}</button>}
          {a.stop && <button className={btn.secondary} type="button" disabled={busy} onClick={() => void run(`/api/tasks/${p.taskId}/stop`, {})}>{t("actions.stop")}</button>}
        </div>
      )}
      {confirm && (
        <form className="rounded-lg border border-line bg-raised p-4" onSubmit={(e) => (e.preventDefault(), void decide(confirm))}>
          <p className="text-sm font-medium">{confirm === "approved" ? t("actions.confirmApprove") : t("actions.confirmReject")}</p>
          {confirm === "approved" && needsCode && (
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
      {noteOpen && !confirm && (
        <form className="rounded-lg border border-line bg-raised p-4" onSubmit={sendBack}>
          {noteBox}
          <div className="mt-3 flex gap-2">
            <button className={btn.primary} type="submit" disabled={busy || note.trim() === ""}>{t("actions.sendBackSend")}</button>
            <button className={btn.ghost} type="button" onClick={() => setNoteOpen(false)}>{t("actions.back")}</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
    </div>
  );
}
