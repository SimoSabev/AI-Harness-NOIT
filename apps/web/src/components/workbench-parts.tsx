import type { Key, T } from "../i18n/t";
import type { FleetRow, TerminalLine, ToolCallRow } from "../lib/workbench";
import { card, label } from "./ui";

// D-307: the pieces shared by the workbench screens (design H1–H6).
const AGENT: Record<FleetRow["state"], { ring: string; fill: string; text: string; label: Key }> = {
  running: { ring: "bg-ok", fill: "bg-ok-soft", text: "text-ok", label: "wb.state.running" },
  waiting: { ring: "bg-warn", fill: "bg-warn-soft", text: "text-warn", label: "wb.state.waiting" },
  failed: { ring: "bg-bad", fill: "bg-bad-soft", text: "text-bad", label: "wb.state.failed" },
  done: { ring: "bg-idle", fill: "bg-raised", text: "text-mute", label: "wb.state.done" },
  idle: { ring: "bg-line-strong", fill: "bg-raised", text: "text-mute", label: "wb.state.idle" },
};
/** Colours and the catalog key of the state word (the judge is Mandat). */
export const agentTone = (s: FleetRow["state"], role?: FleetRow["role"]): { ring: string; fill: string; text: string; label: Key } => (role === "judge" ? { ring: "bg-info", fill: "bg-info-soft", text: "text-info", label: "brand.judge" } : AGENT[s]);

export function AgentHex({ s, role, initials, size = "md" }: { s: FleetRow["state"]; role?: FleetRow["role"]; initials: string; size?: "sm" | "md" }) {
  const t = agentTone(s, role);
  const box = size === "sm" ? "h-6 w-7" : "h-8 w-9";
  return (
    <span aria-hidden="true" className={`hex inline-flex shrink-0 items-center justify-center ${box} ${t.ring} ${s === "running" ? "beat" : ""}`}>
      <span className={`hex flex h-[calc(100%-4px)] w-[calc(100%-4px)] items-center justify-center font-display text-[10px] font-semibold ${t.fill} ${t.text}`}>{initials}</span>
    </span>
  );
}
export const initialsOf = (agent: string, role: FleetRow["role"]) => (role === "judge" ? "M" : role === "subagent" ? "↳" : agent.toLowerCase().startsWith("claude") ? "CC" : agent.toLowerCase().startsWith("codex") ? "CX" : agent.toLowerCase().startsWith("gemini") ? "GM" : agent.slice(0, 2).toUpperCase());

export function Meter({ value, max = 100, tone = "accent", label: l }: { value: number; max?: number; tone?: "accent" | "warn" | "bad" | "info"; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bg = tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : tone === "info" ? "bg-info" : "bg-accent";
  return (
    <span role="meter" aria-label={l} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} className="block h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <span className={`block h-1.5 rounded-full ${bg}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

/** The calm flowing lines from the photos, behind a header. Decorative; frozen when motion is reduced. */
export function FlowLines({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} viewBox="0 0 1200 160" preserveAspectRatio="none">
      <path d="M0 130 C 180 100, 330 160, 520 122 S 860 86, 1040 124 S 1160 146, 1200 118" fill="none" stroke="var(--accent)" strokeWidth="1.2" opacity=".35" />
      <path className="flow-line" d="M0 130 C 180 100, 330 160, 520 122 S 860 86, 1040 124 S 1160 146, 1200 118" fill="none" stroke="var(--accent-text)" strokeWidth="2" opacity=".55" />
      <path className="flow-line-slow" d="M0 146 C 200 120, 360 168, 560 136 S 880 104, 1060 138 S 1170 156, 1200 132" fill="none" stroke="var(--accent)" strokeWidth="1.4" opacity=".4" />
    </svg>
  );
}

const KIND: Record<ToolCallRow["kind"], string> = { mcp: "mcp", skill: "skill", builtin: "tool", bash: "bash", mandat: "mandat" };
const DECISION: Record<ToolCallRow["decision"], string> = { allowed: "text-ok", asked: "text-warn", denied: "text-bad", slow: "text-warn", error: "text-bad" };
export function ToolCalls({ calls, t, withAgent = true }: { calls: ToolCallRow[]; t: T; withAgent?: boolean }) {
  return (
    <ol className="divide-y divide-line">
      {calls.map((c, i) => (
        <li key={`${c.at}-${i}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-2">
          <span className="font-mono text-[11px] text-mute">{new Date(c.at).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="min-w-0">
            <span className="block truncate font-mono text-xs"><span className="text-ink">{c.tool}</span> <span className="text-mute">{c.summary}</span></span>
            <span className="block truncate text-[11px] text-mute">{withAgent ? `${c.agent} · ` : ""}<span className={c.kind === "mandat" ? "text-info" : c.kind === "skill" ? "text-accent-text" : ""}>{KIND[c.kind]}</span></span>
          </span>
          <span className={`text-right text-xs ${DECISION[c.decision]}`}>{t(`wb.decision.${c.decision}`)}</span>
        </li>
      ))}
    </ol>
  );
}


export function SessionTree({ sessions, t }: { sessions: (FleetRow & { depth: number })[]; t: T }) {
  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-2.5" style={{ paddingLeft: s.depth * 18 }}>
          <AgentHex s={s.state} role={s.role} initials={initialsOf(s.agent, s.role)} size="sm" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm">{s.agent}</span><span className="block truncate text-xs text-mute">{s.role === "subagent" ? t("wb.subagent") : ""}{s.step}</span></span>
          {s.context_pct !== null && <span className="w-16"><Meter value={s.context_pct} label={t("wb.context", { agent: s.agent })} tone={s.context_pct > 80 ? "warn" : "accent"} /></span>}
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const id = `p-${title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} tabIndex={className.includes("overflow-x-auto") ? 0 : undefined} className={`${card} rise overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 id={id} className="font-display text-sm font-semibold tracking-wide">{title}</h2>
        {aside && <span className="ml-auto text-xs text-mute">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
export { label };

/**
 * E7e: the read-only terminal of a task — the agent's stream after redaction, ≤ 50 000 lines. Chunks of 500 lines with
 * `content-visibility: auto` keep long sessions cheap (the browser skips rendering the chunks out of view).
 */
export function Terminal({ lines, t }: { lines: TerminalLine[]; t: T }) {
  const chunks: TerminalLine[][] = [];
  for (let i = 0; i < lines.length; i += 500) chunks.push(lines.slice(i, i + 500));
  return (
    <div role="log" aria-label={t("wb.terminal")} tabIndex={0} className="max-h-96 overflow-auto bg-raised px-4 py-3 font-mono text-xs leading-5 text-ink">
      {chunks.map((c) => (
        <div key={c[0]?.seq ?? 0} style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${c.length * 20}px` }}>
          {c.map((l) => (
            <div key={l.seq} className="whitespace-pre-wrap break-words">
              <span aria-hidden="true" className="mr-2 inline-block w-3 text-mute">{l.mark}</span>
              {l.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
