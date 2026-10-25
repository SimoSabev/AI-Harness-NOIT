"use client";
import { useEffect, useState } from "react";
import { JobState } from "@mandat/contract";
import type { SystemJob } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { doctorRows, jobBadge, ledgerSummary, statsSummary } from "../lib/system-view";
import { StatusBadge, btn, card } from "./ui";

// D-370: the CLI commands of `pnpm local` from the web — check the computer, build the images and the demo repos,
// the judge's numbers, the ledger chain. Each button runs one job from a closed list; the page asks again while one runs.
const SECTIONS: { id: string; title: Key; hint: Key; jobs: { job: SystemJob; label: Key }[] }[] = [
  { id: "doctor", title: "system.doctor", hint: "system.doctorHint", jobs: [{ job: "doctor", label: "system.run.doctor" }] },
  { id: "images", title: "system.images", hint: "system.imagesHint", jobs: [{ job: "images", label: "system.run.images" }, { job: "images-ui", label: "system.run.imagesUi" }] },
  { id: "fixtures", title: "system.fixtures", hint: "system.fixturesHint", jobs: [{ job: "fixtures", label: "system.run.fixtures" }, { job: "fixtures-force", label: "system.run.fixturesForce" }] },
  { id: "stats", title: "system.stats", hint: "system.statsHint", jobs: [{ job: "stats", label: "system.run.stats" }] },
  { id: "ledger", title: "system.ledger", hint: "system.ledgerHint", jobs: [{ job: "verify-log", label: "system.run.ledger" }] },
];

export function SystemPanel({ initial }: { initial: JobState[] }) {
  const t = useT();
  const [jobs, setJobs] = useState<JobState[]>(initial);
  const [err, setErr] = useState<string | null>(null);
  const of = (j: SystemJob) => jobs.find((x) => x.job === j);
  const running = jobs.some((j) => j.state === "running");

  const refresh = async () => {
    const r = await fetch("/api/system", { credentials: "same-origin", cache: "no-store" });
    const body = (await r.json().catch(() => ({}))) as { jobs?: unknown };
    const list = Array.isArray(body.jobs) ? body.jobs.map((j) => JobState.safeParse(j)).filter((p) => p.success).map((p) => p.data) : null;
    if (r.ok && list) setJobs(list);
  };
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [running]);

  const run = async (job: SystemJob) => {
    if (job === "fixtures-force" && !window.confirm(t("system.fixturesForceConfirm"))) return;
    setErr(null);
    const r = await postJson(`/api/system/${job}`, {});
    const s = JobState.safeParse(r.body);
    if (r.status === 200 && s.success) setJobs((all) => all.map((x) => (x.job === job ? s.data : x)));
    else setErr(errorText(t, r));
  };

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" }) : "");
  return (
    <div className="mt-6 space-y-4">
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      {SECTIONS.map((sec) => (
        <section key={sec.id} aria-labelledby={`sys-${sec.id}`} className={`${card} p-5`}>
          <h2 id={`sys-${sec.id}`} className="font-display text-base font-semibold">{t(sec.title)}</h2>
          <p className="mt-1 text-sm text-mute">{t(sec.hint)}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {sec.jobs.map(({ job, label }) => (
              <button key={job} type="button" className={job === sec.jobs[0]?.job ? btn.primary : btn.secondary} disabled={of(job)?.state === "running"} onClick={() => void run(job)}>{t(label)}</button>
            ))}
          </div>
          {sec.jobs.map(({ job }) => {
            const s = of(job);
            if (!s || s.state === "idle") return null;
            const b = jobBadge(s);
            return (
              <div key={job} className="mt-4 space-y-3">
                <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
                  <StatusBadge tone={b.tone} label={t(b.label)} />
                  <span className="font-mono text-xs text-mute">mandat {job}</span>
                  <span className="text-xs text-mute">{s.state === "running" ? t("system.since", { time: when(s.started_at) }) : t("system.at", { time: when(s.finished_at) })}</span>
                </p>
                <Result job={job} s={s} />
                {s.lines.length > 0 && (
                  <details open={s.state === "failed" && job !== "doctor"}>
                    <summary className="cursor-pointer text-xs text-mute">{t("system.output", { n: s.lines.length })}</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-raised px-3 py-2 font-mono text-xs whitespace-pre-wrap">{s.lines.join("\n")}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function Result({ job, s }: { job: SystemJob; s: JobState }) {
  const t = useT();
  if (job === "doctor") {
    const rows = doctorRows(s.result);
    return rows ? (
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map((r) => (
          <li key={r.name} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className={`min-w-0 break-words text-xs ${r.ok ? "text-mute" : "text-bad"}`}>{r.ok ? "✓" : "✗"} {r.detail}</span>
          </li>
        ))}
      </ul>
    ) : null;
  }
  if (job === "stats") {
    const v = statsSummary(s.result);
    return v ? (
      <div className="text-sm">
        <p>{t("system.statsLine", { total: v.total, verified: v.verified, unknown: v.unknown, failed: v.failed, pct: v.unknownPct, min: v.minutes })}</p>
        {v.reasons.length > 0 && <p className="mt-1 text-xs text-mute">{t("system.statsReasons", { list: v.reasons.map((r) => `${r.cls} × ${r.n}`).join(", ") })}</p>}
      </div>
    ) : null;
  }
  if (job === "verify-log") {
    const l = ledgerSummary(s.result);
    return l ? <p className={`text-sm ${l.ok ? "text-ok" : "text-bad"}`}>{l.ok ? t("system.ledgerOk", { n: l.count ?? 0 }) : t("system.ledgerBad", { seq: l.badSeq ?? "?" })}</p> : null;
  }
  return null;
}
