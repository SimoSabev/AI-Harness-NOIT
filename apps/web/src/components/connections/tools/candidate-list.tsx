"use client";
import { useT } from "../../../i18n/client";
import type { Key } from "../../../i18n/t";
import type { Candidate, SkillCandidate } from "./view";

// D-487: what an import found, before anything is added. A problem says in plain words why it cannot be used.
type Props = {
  mcp: Candidate[];
  skills: SkillCandidate[];
  picked: Set<string>;
  onToggle: (key: string) => void;
  action?: (key: string) => React.ReactNode;
};
export const mcpKey = (c: { name: string }) => `mcp:${c.name}`;
export const skillKey = (s: { name: string }) => `skill:${s.name}`;

export function CandidateList({ mcp, skills, picked, onToggle, action }: Props) {
  const t = useT();
  if (mcp.length === 0 && skills.length === 0) return <p className="text-sm text-mute">{t("tt.nothingFound")}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {mcp.map((c) => {
        const k = mcpKey(c);
        const usable = c.problem === null;
        return (
          <li key={k} className="flex flex-wrap items-start gap-3 px-3 py-2 text-sm">
            <input type="checkbox" className="mt-1" aria-label={t("tt.pick", { name: c.name })} disabled={!usable} checked={usable && picked.has(k)} onChange={() => onToggle(k)} />
            <span className="min-w-0 flex-1">
              <span className="font-mono text-xs">{c.name}</span>{" "}
              <span className="text-xs text-mute">{c.package ?? c.url ?? ""} · {t(c.transport === "http" ? "tt.kind.remote" : "tt.kind.package")} · {c.origin}</span>
              {c.secrets.length > 0 && <span className="block text-xs text-mute">{t("tt.needsSecrets", { names: c.secrets.join(", ") })}</span>}
              {c.notes.map((n) => <span key={n} className="block text-xs text-warn">{t(`tt.note.${n}` as Key)}</span>)}
              {c.problem && <span className="block text-xs text-bad">{t(`tt.problem.${c.problem}` as Key)}</span>}
              {c.findings.map((f) => <span key={`${f.tool}-${f.reason}`} className="block text-xs text-bad">{f.tool}: {t(`mcp.finding.${f.reason}` as Key)}</span>)}
            </span>
            {action?.(k)}
          </li>
        );
      })}
      {skills.map((s) => {
        const k = skillKey(s);
        return (
          <li key={k} className="flex flex-wrap items-start gap-3 px-3 py-2 text-sm">
            <input type="checkbox" className="mt-1" aria-label={t("tt.pick", { name: s.name })} checked={picked.has(k)} onChange={() => onToggle(k)} />
            <span className="min-w-0 flex-1">
              <span className="font-mono text-xs">{s.name}</span> <span className="text-xs text-mute">{t("tt.kind.skill")} · {s.description}</span>
              <span className="block text-[11px] text-mute">{s.origin}</span>
              {s.blocked_reason && <span className="block text-xs text-bad">{t("tt.skillBlocked", { reason: s.blocked_reason })}</span>}
            </span>
            {action?.(k)}
          </li>
        );
      })}
    </ul>
  );
}
