import Link from "next/link";
import type { FleetRow, ToolCallRow, WindowRow } from "../lib/workbench";
import { ago } from "../lib/status";
import { card, label } from "./ui";

// D-307: the pieces shared by the workbench screens (design H1–H6).
export function SampleNote({ what, table }: { what: string; table: string }) {
  return (
    <p role="note" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-line-strong bg-raised px-4 py-2.5 text-sm text-mute">
      <span className="rounded bg-warn-soft px-1.5 py-0.5 font-display text-[11px] font-semibold tracking-[0.12em] text-warn">ПРИМЕР</span>
      <span className="flex-1">Още не се записва: {what}. Когато започне да пише в <code className="font-mono text-ink">{table}</code>, тук ще са истинските данни.</span>
      <Link href="/settings" className="text-xs underline">скрий примерите</Link>
    </p>
  );
}

const AGENT: Record<FleetRow["state"], { ring: string; fill: string; text: string; label: string }> = {
  running: { ring: "bg-ok", fill: "bg-ok-soft", text: "text-ok", label: "работи" },
  waiting: { ring: "bg-warn", fill: "bg-warn-soft", text: "text-warn", label: "чака теб" },
  failed: { ring: "bg-bad", fill: "bg-bad-soft", text: "text-bad", label: "провал" },
  done: { ring: "bg-idle", fill: "bg-raised", text: "text-mute", label: "готов" },
  idle: { ring: "bg-line-strong", fill: "bg-raised", text: "text-mute", label: "свободен" },
};
export const agentTone = (s: FleetRow["state"], role?: FleetRow["role"]) => (role === "judge" ? { ring: "bg-info", fill: "bg-info-soft", text: "text-info", label: "Мандат" } : AGENT[s]);

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
const DECISION: Record<ToolCallRow["decision"], { t: string; c: string }> = {
  allowed: { t: "позволено", c: "text-ok" }, asked: { t: "чака теб", c: "text-warn" }, denied: { t: "спряно", c: "text-bad" }, slow: { t: "бавно", c: "text-warn" }, error: { t: "грешка", c: "text-bad" },
};
export function ToolCalls({ calls, withAgent = true }: { calls: ToolCallRow[]; withAgent?: boolean }) {
  return (
    <ol className="divide-y divide-line">
      {calls.map((c, i) => (
        <li key={`${c.at}-${i}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-2">
          <span className="font-mono text-[11px] text-mute">{new Date(c.at).toLocaleTimeString("bg", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="min-w-0">
            <span className="block truncate font-mono text-xs"><span className="text-ink">{c.tool}</span> <span className="text-mute">{c.summary}</span></span>
            <span className="block truncate text-[11px] text-mute">{withAgent ? `${c.agent} · ` : ""}<span className={c.kind === "mandat" ? "text-info" : c.kind === "skill" ? "text-accent-text" : ""}>{KIND[c.kind]}</span></span>
          </span>
          <span className={`text-right text-xs ${DECISION[c.decision].c}`}>{DECISION[c.decision].t}</span>
        </li>
      ))}
    </ol>
  );
}

const WIN: Record<WindowRow["kind"], { ic: string; g: string }> = { terminal: { ic: ">_", g: "Терминали" }, preview: { ic: "◐", g: "Прегледи в браузъра" }, server: { ic: "●", g: "Сървъри и портове" }, log: { ic: "≡", g: "Логове" } };
export function Windows({ windows }: { windows: WindowRow[] }) {
  const groups = (["terminal", "preview", "server", "log"] as const).map((k) => ({ k, items: windows.filter((w) => w.kind === k) })).filter((g) => g.items.length > 0);
  if (groups.length === 0) return <p className="px-1 text-sm text-mute">Няма отворени прозорци.</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.k}>
          <p className="px-1 pb-1 text-xs text-mute">{WIN[g.k].g} · {g.items.length}</p>
          <ul className="space-y-1">
            {g.items.map((w) => (
              <li key={w.id} className="flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1.5 text-xs">
                <span aria-hidden="true" className={`w-5 font-mono ${w.status === "live" ? "text-ok" : w.status === "slow" ? "text-warn" : "text-mute"}`}>{WIN[g.k].ic}</span>
                {w.url ? <a href={w.url} className="min-w-0 flex-1 truncate text-ink no-underline hover:underline" target="_blank" rel="noreferrer">{w.title}</a> : <span className="min-w-0 flex-1 truncate">{w.title}</span>}
                <span className="font-mono text-[10px] text-mute">{w.status === "live" ? "жив" : w.status === "slow" ? "бави" : ago(w.last_seen_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SessionTree({ sessions }: { sessions: (FleetRow & { depth: number })[] }) {
  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-2.5" style={{ paddingLeft: s.depth * 18 }}>
          <AgentHex s={s.state} role={s.role} initials={initialsOf(s.agent, s.role)} size="sm" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm">{s.agent}</span><span className="block truncate text-xs text-mute">{s.role === "subagent" ? "подагент · " : ""}{s.step}</span></span>
          {s.context_pct !== null && <span className="w-16"><Meter value={s.context_pct} label={`контекст ${s.agent}`} tone={s.context_pct > 80 ? "warn" : "accent"} /></span>}
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const id = `p-${title.replace(/[^a-zа-я0-9]+/gi, "-").toLowerCase()}`;
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
