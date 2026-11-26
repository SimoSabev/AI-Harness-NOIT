"use client";
import type { Key, T } from "../i18n/t";
import { useAgentName, whenShort } from "./agent-names";
import type { JobView } from "../lib/conversation-types";
import type { GateStatus } from "../lib/job-strategy";

// D-558 (demo 4.12): how the harness planned this job and who does what — the profile, one writer or waves, the pilot,
// the model per role and why (fixed sentences chosen from the axes) — and the gates of the final check, each with its
// status. "How do we know it is done": every gate passed in a fresh container against the hidden oracle.

const GATE_TONE: Record<GateStatus, string> = { pass: "text-ok", fail: "text-bad", unknown: "text-warn", "n/a": "text-mute", pending: "text-mute" };

export function JobStrategy({ job, t }: { job: JobView; t: T }) {
  const s = job.strategy;
  // live test 20.11: before the planner is done the plan is not known yet; say so instead of a default "one writer"
  if (job.status === "planning") return <p className="mt-2 text-xs text-mute">{t("job.strategy.planning")}</p>;
  return (
    <div className="mt-2 space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-mute">{t("job.strategy.profile")}</dt>
        <dd>{s.profile ? t(`job.profile.${s.profile}` as Key) : "—"}</dd>
        <dt className="text-mute">{t("job.strategy.mode")}</dt>
        <dd>{s.mode === "waves" ? t("job.strategy.waves", { n: String(s.waves) }) : t("job.strategy.single")}</dd>
        {s.pilot && (
          <>
            <dt className="text-mute">{t("job.strategy.pilot")}</dt>
            <dd>{t(s.pilot.state === "tuned" ? "job.strategy.pilotDone" : "job.strategy.pilotRunning", { n: String(s.pilot.units) })}</dd>
          </>
        )}
        <dt className="text-mute">{t("job.strategy.roles")}</dt>
        <dd className="space-y-0.5">
          {s.roles.map((r) => (
            <p key={r.role}>
              <span className="text-mute">{t(`job.role.${r.role}` as Key)}:</span> <RoleAgent agent={r.agent} model={r.model} t={t} />
            </p>
          ))}
        </dd>
      </dl>
      <ul aria-label={t("job.strategy.why")} className="list-disc space-y-0.5 pl-5 text-xs text-mute">
        {s.reasons.map((k) => <li key={k}>{t(k)}</li>)}
      </ul>
    </div>
  );
}

export function JobGates({ job, t }: { job: JobView; t: T }) {
  return (
    <div className="mt-2">
      <p className="text-xs text-mute">{t("job.gates.title")}</p>
      <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
        {job.gates.map((g) => (
          <li key={g.id} className="flex items-baseline justify-between gap-2">
            <span>{t(`job.gate.${g.id}` as Key)}</span>
            <span className={`font-mono ${GATE_TONE[g.status]}`}>{t(`job.gateStatus.${g.status === "n/a" ? "na" : g.status}` as Key)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** D-610: a role's agent as the person knows it (the account's email) and its limit */
function RoleAgent({ agent, model, t }: { agent: string; model: string | null; t: T }) {
  const name = useAgentName(t.lang)(agent);
  return (
    <span>
      <span className="text-ink">{name.label}</span>
      {model && <span className="font-mono text-mute"> · {model}</span>}
      {name.limitedUntil && <span className="ml-1.5 rounded-md bg-warn-soft px-1.5 py-0.5 text-xs text-warn">{t("agent.limited", { when: whenShort(name.limitedUntil, t.lang) })}</span>}
    </span>
  );
}
