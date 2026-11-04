"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../../../i18n/client";
import { errorText, postJson } from "../../../lib/client/api";
import { btn } from "../../ui";
import { CandidateList, mcpKey } from "./candidate-list";
import type { Candidate, SkillCandidate } from "./view";

// D-485: "Already on this computer" — the person's own Claude Code, Cursor, Gemini CLI and Codex. Nothing is read
// before they press the button; only the server lists are read, never keys. One button per item uses it in Mandat.
export function LocalFound() {
  const t = useT();
  const router = useRouter();
  const [found, setFound] = useState<{ mcp: Candidate[]; skills: SkillCandidate[]; unreadable: string[] } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const look = async () => {
    setBusy(true);
    const r = await postJson("/api/tools/local", { consent: true });
    setBusy(false);
    if (r.status !== 200) return setMsg({ ok: false, text: errorText(t, r) });
    setFound({ mcp: (r.body.mcp ?? []) as Candidate[], skills: (r.body.skills ?? []) as SkillCandidate[], unreadable: (r.body.unreadable ?? []) as string[] });
  };
  const use = async (key: string) => {
    setBusy(true);
    const [kind, name] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const r = await postJson("/api/tools/import", { source: "local", pick: { mcp: kind === "mcp" ? [name] : [], skills: kind === "skill" ? [name] : [] }, approve: true });
    setBusy(false);
    if (r.status !== 201) return setMsg({ ok: false, text: errorText(t, r) });
    setDone((d) => new Set([...d, key]));
    setMsg({ ok: true, text: t("tt.addedAndUsed") });
    router.refresh();
  };

  return (
    <section aria-labelledby="tt-local" className="space-y-3">
      <h3 id="tt-local" className="font-display text-sm font-semibold">{t("tt.local")}</h3>
      <p className="text-sm text-mute">{t("tt.localHint")}</p>
      {!found && <button type="button" className={btn.secondary} disabled={busy} onClick={() => void look()}>{t("tt.localLook")}</button>}
      {found && (
        <>
          <CandidateList
            mcp={found.mcp}
            skills={found.skills}
            picked={new Set()}
            onToggle={() => undefined}
            action={(k) => {
              const blocked = k.startsWith("mcp:") ? found.mcp.find((c) => mcpKey(c) === k)?.problem != null : found.skills.find((s) => `skill:${s.name}` === k)?.blocked_reason != null;
              return done.has(k) ? <span className="text-xs text-ok">{t("tt.inUse")}</span> : <button type="button" className={btn.secondary} disabled={busy || blocked} onClick={() => void use(k)}>{t("tt.useInMandat")}</button>;
            }}
          />
          {found.unreadable.length > 0 && <p className="text-xs text-warn">{t("tt.unreadable", { names: found.unreadable.join(", ") })}</p>}
        </>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </section>
  );
}
