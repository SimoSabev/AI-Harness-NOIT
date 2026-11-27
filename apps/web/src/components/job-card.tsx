"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Key, T } from "../i18n/t";
import type { BringReply } from "@mandat/contract";
import type { JobUnitView, JobView } from "../lib/conversation-types";
import { JobGates, JobStrategy } from "./job-strategy";
import { SealRing } from "./seal-ring";
import { DiffView } from "./diff-view";
import { sealView } from "../lib/seal-view";
import { sealSummary } from "../lib/seal-summary";
import { splitDiff } from "../lib/diff-view";
import { btn, input } from "./ui";

// D-535: the job under the approved spec and oracle. D-710 (night 27.11.2026, three critics): decision first — once
// sealed the card says in one line whether it passed and how many criteria, what is left to the person (the task page's
// own sentences, with the place), the whole change, and one button; the plan, units, gates and hashes are under Details.
// While the job works the units stay in view: they are what is happening.

// D-540: "Bring into my folder" — the person's click moves their own folder forward to the merged change (or says why not)
export interface JobActions { canApprove: boolean; busy: boolean; onApprove: (sealHash: string, code?: string) => void; onBring?: () => void; brought?: BringReply | null; /** D-710: this computer approves by presence (D-368), no code */ localApproval?: boolean }

const UNIT_TONE: Record<string, string> = { passed: "text-ok", failed: "text-warn", blocked: "text-warn", parked: "text-warn", running: "text-ink", pending: "text-mute" };
const UNIT_STATUSES = ["pending", "running", "passed", "failed", "blocked", "parked"] as const;
const unitStatus = (s: string): (typeof UNIT_STATUSES)[number] => UNIT_STATUSES.find((x) => x === s) ?? "blocked";
/** D-599: each unit's dot — cobalt while it works, cyan when it passed, coral when it failed, amber when it waits */
const UNIT_DOT: Record<(typeof UNIT_STATUSES)[number], string> = { pending: "bg-line-strong", running: "bg-info animate-pulse", passed: "bg-ok", failed: "bg-bad", blocked: "bg-warn", parked: "bg-warn" };
const HEAD_TONE = { verified: "text-ok", unknown: "text-warn", failed: "text-bad" } as const;

export function JobCard({ job, t, a, conversation }: { job: JobView; t: T; a: JobActions; conversation: string }) {
  const s = job.status;
  const decided = job.seal !== null && (s === "sealed" || s === "approved" || s === "delivered");
  const sum = job.seal ? sealSummary(job.seal, t.lang) : null;
  return (
    <section aria-label={t("chat.job")} className="rounded-[12px] border border-line bg-panel px-5 py-4 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.15)]">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-mute">{t("chat.job")}</p>
          {decided && sum ? (
            <>
              <p className={`mt-1 text-[15px] font-medium ${HEAD_TONE[sum.headline]}`}>{t(`job.head.${sum.headline}`)}</p>
              <p className="mt-0.5 text-xs text-mute">{t("job.criteria", { n: sum.passed, of: sum.of })}{s !== "sealed" ? ` · ${t(`chat.job.status.${s}` as Key)}` : ""}</p>
            </>
          ) : (
            <p className={s === "parked" || s === "failed" ? "mt-1 text-warn" : "mt-1"}>{t(`chat.job.status.${s}` as Key)}</p>
          )}
        </div>
        {(job.seal || job.gates.some((g) => g.status !== "pending")) && (
          // D-599: the seal of the brand kit, small beside the verdict
          <div className="-m-10 shrink-0 scale-50"><SealRing view={sealView(job.gates, job.seal?.verdict ?? null)} t={t} /></div>
        )}
      </div>
      {job.question && (
        <div role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          <p className="text-xs font-medium">{t("chat.job.question")}</p>
          <p>{job.question}</p>
        </div>
      )}
      {!decided && job.status !== "planning" && <Units job={job} t={t} />}
      {decided && sum && sum.decide.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-warn">{t(a.canApprove ? "job.decide.title" : "job.decide.titleViewer")}</p>
          <ul className="mt-1 space-y-1.5">
            {sum.decide.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="sig-diamond mt-1.5 inline-block size-2 shrink-0 bg-warn" />
                <span className="min-w-0">
                  {d.where && <span className="mr-1.5 font-mono text-xs text-ink">{d.where}{d.change ? ` (${d.change})` : ""}</span>}
                  <span className="text-mute">{d.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {decided && sum && sum.notRun.length > 0 && <p className="mt-2 text-xs text-faint">{t("job.notRun", { list: sum.notRun.join(", ") })}</p>}
      {decided && a.canApprove && job.seal && <JobChange conversation={conversation} job={job.id} seal={job.seal.hash} t={t} />}
      {s === "sealed" && job.seal && a.canApprove && <ApproveSeal hash={job.seal.hash} unknown={job.seal.verdict === "UNKNOWN"} t={t} a={a} />}
      {s === "delivered" && job.merged_sha && a.canApprove && a.onBring && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-mute">{t("chat.job.bringHint")}</p>
          <button type="button" className={btn.secondary} disabled={a.busy} onClick={a.onBring}>{t("chat.job.bring")}</button>
        </div>
      )}
      {s === "delivered" && a.brought && <Brought r={a.brought} t={t} />}
      <details className="group mt-3 border-t border-line pt-2">
        <summary className="cursor-pointer list-none text-xs text-mute hover:text-ink [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="mr-1 inline-block transition group-open:rotate-90">›</span>{t("job.details")}
        </summary>
        <JobStrategy job={job} t={t} />
        {decided && <Units job={job} t={t} />}
        <JobGates job={job} t={t} />
        {job.seal && <p className="mt-2 font-mono text-[11px] text-faint">{t("job.ref", { ref: job.seal.result_ref.slice(0, 12) })}{job.merged_sha ? ` · ${t("chat.job.merged", { sha: job.merged_sha.slice(0, 12) })}` : ""}</p>}
      </details>
    </section>
  );
}

/** the plan's units, one line each, each with a link to its own task (D-710: every unit, not only the current one) */
function Units({ job, t }: { job: JobView; t: T }) {
  if (job.units.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1">
      {job.units.map((u: JobUnitView) => {
        const st = unitStatus(u.status);
        return (
          <li key={u.id} className="flex items-baseline gap-2" aria-current={job.current === u.id ? "step" : undefined}>
            <span aria-hidden="true" className={`inline-block size-2 shrink-0 translate-y-[-1px] rounded-full ${UNIT_DOT[st]}`} />
            <span className="min-w-0 flex-1">
              {u.title}
              {u.failing.length > 0 && <span className="block text-xs text-warn">{t("chat.job.failing", { ids: u.failing.join(", ") })}</span>}
            </span>
            {u.copy && u.copy.attempt > 1 && <span className="text-xs text-faint">{t("job.unit.attempt", { n: u.copy.attempt })}</span>}
            <span className={`text-xs ${UNIT_TONE[st] ?? ""}`}>{t(`chat.job.unit.${st}` as Key)}</span>
            {u.task_id && <Link href={`/?task=${u.task_id}`} className="text-xs text-accent-text underline-offset-4 hover:underline">{t("job.unit.open")}</Link>}
          </li>
        );
      })}
    </ol>
  );
}

type Change = { state: "loading" } | { state: "ok"; diff: string } | { state: "omitted"; bytes: number } | { state: "changed" } | { state: "none" };

/** D-710: the whole change of this card's job, from its own route (approver+), when the card shows a decided job */
function JobChange({ conversation, job, seal, t }: { conversation: string; job: string; seal: string; t: T }) {
  const [c, setC] = useState<Change>({ state: "loading" });
  useEffect(() => {
    let live = true;
    fetch(`/api/conversations/${conversation}/job/diff?job=${encodeURIComponent(job)}`, { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as { diff?: unknown; omitted_bytes?: unknown };
        if (!live) return;
        if (r.status === 409) return setC({ state: "changed" });
        if (r.status !== 200) return setC({ state: "none" });
        if (typeof b.omitted_bytes === "number") return setC({ state: "omitted", bytes: b.omitted_bytes });
        setC(typeof b.diff === "string" && b.diff !== "" ? { state: "ok", diff: b.diff } : { state: "none" });
      })
      .catch(() => live && setC({ state: "none" }));
    return () => {
      live = false;
    };
    // a new seal (main moved, the job was checked again) is a new change
  }, [conversation, job, seal]);
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-mute">{t("job.change.title")}</p>
      {c.state === "ok" ? <DiffView files={splitDiff(c.diff)} t={t} /> : (
        <p className={`text-xs ${c.state === "changed" ? "text-warn" : "text-mute"}`}>
          {c.state === "loading" ? t("job.change.loading") : c.state === "omitted" ? t("job.change.omitted", { mb: (c.bytes / 1048576).toFixed(1) }) : c.state === "changed" ? t("job.change.changed") : t("job.change.none")}
        </p>
      )}
    </div>
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

/** D-710: the approve step, pure — an UNKNOWN seal asks once more after the click: on this computer "Merge anyway?"
 * (presence, D-368), elsewhere the second factor's code (the button waits for six digits) */
export function approveStep(o: { unknown: boolean; asking: boolean; local: boolean; code: string }): { hint: Key; label: Key; input: boolean; ready: boolean; send: "ask" | "approve"; code: string | undefined } {
  if (!o.asking) return { hint: "chat.job.approveHint", label: "chat.job.approve", input: false, ready: true, send: o.unknown ? "ask" : "approve", code: undefined };
  if (o.local) return { hint: "job.code.local", label: "job.code.merge", input: false, ready: true, send: "approve", code: undefined };
  return { hint: "job.code.why", label: "job.code.confirm", input: true, ready: o.code.length === 6, send: "approve", code: o.code.length === 6 ? o.code : undefined };
}

/** D-598: Approve and merge; the UNKNOWN step is approveStep's */
function ApproveSeal({ hash, unknown, t, a }: { hash: string; unknown: boolean; t: T; a: JobActions }) {
  const [code, setCode] = useState("");
  const [asking, setAsking] = useState(false);
  const st = approveStep({ unknown, asking, local: a.localApproval === true, code });
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:flex-wrap sm:items-center">
      <p className="min-w-0 flex-1 text-xs text-mute">{t(st.hint)}</p>
      {st.input && (
        <label className="text-xs text-mute">
          {t("chat.job.code")}
          <input className={`${input} ml-2 w-28 font-mono`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
      <button type="button" className={btn.primary} disabled={a.busy || !st.ready} onClick={() => (st.send === "ask" ? setAsking(true) : a.onApprove(hash, st.code))}>
        {t(st.label)}
      </button>
    </div>
  );
}
