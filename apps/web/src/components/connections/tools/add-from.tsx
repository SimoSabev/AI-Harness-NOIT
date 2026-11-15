"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../../../i18n/client";
import type { Key } from "../../../i18n/t";
import { errorText, postJson } from "../../../lib/client/api";
import { useNeedsCode } from "../../second-factor";
import { btn, input } from "../../ui";
import { Select } from "../../select";
import { CandidateList, mcpKey, skillKey } from "./candidate-list";
import { SOURCES, detectSource, sourceBody } from "./view";
import type { Candidate, ImportSource, SkillCandidate } from "./view";

// D-487: "Add from…" — one box for a link, a repo, a package, a catalog name or pasted JSON. Check shows what was found
// (nothing is saved); Add puts the picked ones in the list waiting for approval; Add and use also approves them.
export function AddFrom() {
  const t = useT();
  const router = useRouter();
  const needsCode = useNeedsCode();
  const [raw, setRaw] = useState("");
  const [chosen, setChosen] = useState<ImportSource | null>(null);
  const [found, setFound] = useState<{ mcp: Candidate[]; skills: SkillCandidate[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const source = chosen ?? detectSource(raw);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/tools/import/preview", sourceBody(source, raw));
    setBusy(false);
    if (r.status !== 200) {
      setFound(null);
      setMsg({ ok: false, text: t("tt.checkFailed", { why: String(r.body.error ?? r.status) }) });
      return;
    }
    const f = { mcp: (r.body.mcp ?? []) as Candidate[], skills: (r.body.skills ?? []) as SkillCandidate[] };
    setFound(f);
    setPicked(new Set([...f.mcp.filter((c) => c.problem === null).map(mcpKey), ...f.skills.filter((s) => s.blocked_reason === null).map(skillKey)]));
  };
  const add = async (approve: boolean) => {
    setBusy(true);
    const pick = { mcp: [...picked].filter((k) => k.startsWith("mcp:")).map((k) => k.slice(4)), skills: [...picked].filter((k) => k.startsWith("skill:")).map((k) => k.slice(6)) };
    const r = await postJson("/api/tools/import", { ...sourceBody(source, raw), pick, approve, ...(code ? { code } : {}) });
    setBusy(false);
    if (r.status !== 201) return setMsg({ ok: false, text: errorText(t, r) });
    const needCode = ((r.body.mcp ?? []) as { vet_status: string }[]).some((m) => m.vet_status === "second_factor_required");
    setMsg({ ok: true, text: t(needCode ? "mcp.needCode" : approve ? "tt.addedAndUsed" : "tt.added") });
    setFound(null);
    router.refresh();
  };
  const toggle = (k: string) => setPicked((p) => (p.has(k) ? new Set([...p].filter((x) => x !== k)) : new Set([...p, k])));

  return (
    <section aria-labelledby="tt-add" className="space-y-3">
      <h3 id="tt-add" className="font-display text-sm font-semibold">{t("tt.addFrom")}</h3>
      <p className="text-sm text-mute">{t("tt.addHint")}</p>
      <form onSubmit={(e) => void check(e)} className="space-y-2">
        <textarea className={`${input} min-h-20 font-mono text-xs`} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={t("tt.addPlaceholder")} aria-label={t("tt.addFrom")} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">{t("tt.source")}
            <Select className="mt-1" value={source} onChange={(v) => setChosen(v as ImportSource)} options={SOURCES.map((s) => ({ value: s, label: t(`tt.source.${s}` as Key) }))} />
          </label>
          <button type="submit" className={btn.secondary} disabled={busy || raw.trim() === ""}>{t("tt.check")}</button>
        </div>
      </form>
      {found && (
        <div className="space-y-2">
          <CandidateList mcp={found.mcp} skills={found.skills} picked={picked} onToggle={toggle} />
          {needsCode && <label className="block max-w-xs text-xs">{t("mcp.code")}<input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={busy || picked.size === 0} onClick={() => void add(true)}>{t("tt.addAndUse")}</button>
            <button type="button" className={btn.secondary} disabled={busy || picked.size === 0} onClick={() => void add(false)}>{t("tt.addOnly")}</button>
          </div>
          <p className="text-xs text-mute">{t("tt.safety")}</p>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </section>
  );
}
