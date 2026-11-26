"use client";
import Link from "next/link";
import { useState } from "react";
import type { Key, T } from "../i18n/t";
import type { BringReply } from "@mandat/contract";
import type { JobView } from "../lib/conversation-types";
import { JobGates, JobStrategy } from "./job-strategy";
import { SealRing } from "./seal-ring";
import { sealView } from "../lib/seal-view";
import { btn, input } from "./ui";

// D-535 (M1 X6/X7 minimum): the job under the approved spec and oracle — the plan (units with their criteria and
// status), the current unit, each unit's verdict, a parked question, the seal (checked / not checked) and the one
// approval that lets Mandat take the job branch into main. Kept small: the UI will be redesigned.

// D-540: "Bring into my folder" — the person's click moves their own folder forward to the merged change (or says why not)
export interface JobActions { canApprove: boolean; busy: boolean; onApprove: (sealHash: string, code?: string) => void; onBring?: () => void; brought?: BringReply | null }

const UNIT_TONE: Record<string, string> = { passed: "text-ok", failed: "text-warn", blocked: "text-warn", parked: "text-warn", running: "text-ink", pending: "text-mute" };
const UNIT_STATUSES = ["pending", "running", "passed", "failed", "blocked", "parked"] as const;
const unitStatus = (s: string): (typeof UNIT_STATUSES)[number] => UNIT_STATUSES.find((x) => x === s) ?? "blocked";
/** D-599: each unit's strap — cobalt while it works, cyan when it passed, coral when it failed, amber when it waits */
const UNIT_BAR: Record<(typeof UNIT_STATUSES)[number], string> = { pending: "bg-line-strong", running: "bg-info animate-pulse", passed: "bg-ok", failed: "bg-bad", blocked: "bg-warn", parked: "bg-warn" };

export function JobCard({ job, t, a }: { job: JobView; t: T; a: JobActions }) {
  const s = job.status;
  return (
    <section aria-label={t("chat.job")} className="rounded-[12px] border border-line bg-panel px-5 py-4 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.15)]">
      <p className="text-xs font-medium text-mute">{t("chat.job")}</p>
      <p className={s === "parked" || s === "failed" ? "mt-1 text-warn" : s === "delivered" ? "mt-1 font-medium text-ok" : "mt-1"}>{t(`chat.job.status.${s}` as Key)}</p>
      <JobStrategy job={job} t={t} />
      {job.units.length > 0 && (
        <ol className="mt-2 space-y-1">
          {job.units.map((u) => (
            <li key={u.id} className="flex flex-wrap items-baseline gap-x-2" aria-current={job.current === u.id ? "step" : undefined}>
              {job.strategy.mode === "waves" && <span className="font-mono text-xs text-mute">{t("job.unit.wave", { n: String(u.wave + 1) })}</span>}
              <span className="font-mono text-xs text-mute">{u.id}</span>
              {u.pilot && <span className="rounded bg-raised px-1.5 text-[11px] text-mute">{t("job.unit.pilot")}</span>}
              <span className="min-w-0 flex-1">{u.title}</span>
              <span className="font-mono text-xs text-mute">{u.criteria.join(", ")}</span>
              <span className={`text-xs ${UNIT_TONE[unitStatus(u.status)] ?? ""}`}>{t(`chat.job.unit.${unitStatus(u.status)}` as Key)}</span>
              {u.result && <span className="font-mono text-xs">{u.result}</span>}
              {u.copy && <span className="w-full font-mono text-[11px] text-mute">{t("job.unit.copy", { task: u.copy.task, attempt: String(u.copy.attempt), state: u.copy.state })}</span>}
              {u.failing.length > 0 && <span className="w-full text-xs text-warn">{t("chat.job.failing", { ids: u.failing.join(", ") })}</span>}
              <span aria-hidden="true" className={`h-1.5 w-full rounded-full ${UNIT_BAR[unitStatus(u.status)]}`} />
              {u.task_id && job.current === u.id && <Link href={`/?task=${u.task_id}`} className="text-xs text-accent underline-offset-4 hover:underline">{t("chat.job.openUnit")}</Link>}
            </li>
          ))}
        </ol>
      )}
      {/* D-599: the seal — the gates as a ring around the verdict */}
      {(job.seal || job.gates.some((g) => g.status !== "pending")) && (
        <div className="mt-3 flex justify-center"><SealRing view={sealView(job.gates, job.seal?.verdict ?? null)} t={t} /></div>
      )}
      <JobGates job={job} t={t} />
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
      {s === "sealed" && job.seal?.verdict === "UNKNOWN" && <p role="note" className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{t("chat.job.unknownSeal")}</p>}
      {s === "sealed" && job.seal && a.canApprove && <ApproveSeal hash={job.seal.hash} unknown={job.seal.verdict === "UNKNOWN"} t={t} a={a} />}
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

/** D-598: Approve and merge; an UNKNOWN seal also takes the person's code (the server asks for it, on this computer it may not) */
function ApproveSeal({ hash, unknown, t, a }: { hash: string; unknown: boolean; t: T; a: JobActions }) {
  const [code, setCode] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 text-xs text-mute">{t("chat.job.approveHint")}</p>
      {unknown && (
        <label className="text-xs text-mute">
          {t("chat.job.code")}
          <input className={`${input} mt-1 w-28 font-mono`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
      <button type="button" className={btn.primary} disabled={a.busy} onClick={() => a.onApprove(hash, unknown && code.length === 6 ? code : undefined)}>{t("chat.job.approve")}</button>
    </div>
  );
}
