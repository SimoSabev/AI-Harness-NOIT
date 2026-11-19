"use client";
import Link from "next/link";
import type { Key, T } from "../i18n/t";
import type { BringReply } from "@mandat/contract";
import type { JobView } from "../lib/conversation-types";
import { btn } from "./ui";

// D-535 (M1 X6/X7 minimum): the job under the approved spec and oracle — the plan (units with their criteria and
// status), the current unit, each unit's verdict, a parked question, the seal (checked / not checked) and the one
// approval that lets Mandat take the job branch into main. Kept small: the UI will be redesigned.

// D-540: "Bring into my folder" — the person's click moves their own folder forward to the merged change (or says why not)
export interface JobActions { canApprove: boolean; busy: boolean; onApprove: (sealHash: string) => void; onBring?: () => void; brought?: BringReply | null }

const UNIT_TONE: Record<string, string> = { passed: "text-ok", failed: "text-warn", blocked: "text-warn", running: "text-ink", pending: "text-mute" };
const UNIT_STATUSES = ["pending", "running", "passed", "failed", "blocked"] as const;
const unitStatus = (s: string): (typeof UNIT_STATUSES)[number] => UNIT_STATUSES.find((x) => x === s) ?? "blocked";

export function JobCard({ job, t, a }: { job: JobView; t: T; a: JobActions }) {
  const s = job.status;
  return (
    <section aria-label={t("chat.job")} className="rounded-xl border border-line-strong bg-panel px-4 py-3 text-sm">
      <p className="font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">{t("chat.job")}</p>
      <p className={s === "parked" || s === "failed" ? "mt-1 text-warn" : s === "delivered" ? "mt-1 font-medium text-ok" : "mt-1"}>{t(`chat.job.status.${s}` as Key)}</p>
      {job.units.length > 0 && (
        <ol className="mt-2 space-y-1">
          {job.units.map((u) => (
            <li key={u.id} className="flex flex-wrap items-baseline gap-x-2" aria-current={job.current === u.id ? "step" : undefined}>
              <span className="font-mono text-xs text-mute">{u.id}</span>
              <span className="min-w-0 flex-1">{u.title}</span>
              <span className="font-mono text-xs text-mute">{u.criteria.join(", ")}</span>
              <span className={`text-xs ${UNIT_TONE[unitStatus(u.status)] ?? ""}`}>{t(`chat.job.unit.${unitStatus(u.status)}` as Key)}</span>
              {u.result && <span className="font-mono text-xs">{u.result}</span>}
              {u.failing.length > 0 && <span className="w-full text-xs text-warn">{t("chat.job.failing", { ids: u.failing.join(", ") })}</span>}
              {u.task_id && job.current === u.id && <Link href={`/?task=${u.task_id}`} className="text-xs text-accent underline-offset-4 hover:underline">{t("chat.job.openUnit")}</Link>}
            </li>
          ))}
        </ol>
      )}
      {job.question && (
        <div role="alert" className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          <p className="text-xs font-medium">{t("chat.job.question")}</p>
          <p>{job.question}</p>
        </div>
      )}
      {job.seal && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-mute">{t("chat.job.seal.verdict")}</dt>
          <dd className="font-mono">{job.seal.verdict}</dd>
          <dt className="text-mute">{t("chat.job.seal.ref")}</dt>
          <dd className="font-mono">{job.seal.result_ref.slice(0, 12)}</dd>
          <dt className="text-mute">{t("chat.job.seal.checked")}</dt>
          <dd className="font-mono text-ok">{job.seal.checked.join(", ") || "-"}</dd>
          <dt className="text-mute">{t("chat.job.seal.unchecked")}</dt>
          <dd className={job.seal.unchecked.length > 0 ? "text-warn" : "text-mute"}>{job.seal.unchecked.length > 0 ? job.seal.unchecked.join("; ") : t("chat.job.seal.none")}</dd>
        </dl>
      )}
      {s === "sealed" && job.seal && a.canApprove && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-mute">{t("chat.job.approveHint")}</p>
          <button type="button" className={btn.primary} disabled={a.busy} onClick={() => a.onApprove(job.seal?.hash ?? "")}>{t("chat.job.approve")}</button>
        </div>
      )}
      {s === "delivered" && job.merged_sha && <p className="mt-2 font-mono text-xs text-mute">{t("chat.job.merged", { sha: job.merged_sha.slice(0, 12) })}</p>}
      {s === "delivered" && job.merged_sha && a.canApprove && a.onBring && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-mute">{t("chat.job.bringHint")}</p>
          <button type="button" className={btn.secondary} disabled={a.busy} onClick={a.onBring}>{t("chat.job.bring")}</button>
        </div>
      )}
      {s === "delivered" && a.brought && <Brought r={a.brought} t={t} />}
    </section>
  );
}

function Brought({ r, t }: { r: BringReply; t: T }) {
  if (r.ok) return <p role="status" className="mt-2 text-xs text-ok">{r.from === r.to ? t("chat.job.bring.upToDate", { folder: r.folder }) : t("chat.job.bring.done", { folder: r.folder, files: r.files })}</p>;
  return (
    <div role="alert" className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
      <p>{t(`chat.job.bring.no.${r.reason}` as Key, { folder: r.folder ?? "", detail: r.detail ?? "" })}</p>
      {r.command && (
        <>
          <p className="mt-1 text-mute">{t("chat.job.bring.yourself")}</p>
          <code className="mt-0.5 block break-all font-mono text-ink">{r.command}</code>
        </>
      )}
    </div>
  );
}
