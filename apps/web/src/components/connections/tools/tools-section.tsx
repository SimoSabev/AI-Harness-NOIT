"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../../../i18n/client";
import type { Key } from "../../../i18n/t";
import { errorText, postJson } from "../../../lib/client/api";
import { useNeedsCode } from "../../second-factor";
import { btn, input } from "../../ui";
import { AddFrom } from "./add-from";
import { LocalFound } from "./local-found";
import { BUILTIN_TOOLS, matches } from "./view";
import type { ServerRow, SkillRow } from "./view";

// D-487: the "MCP, tools and skills" section of Connections — what is built in and on, what is connected (with the
// vetting status), "Add from…", and what this computer's own AI clients already have. Self-contained: it gets rows.
type Props = { servers: ServerRow[]; skills: SkillRow[]; canEdit: boolean; isLocal: boolean };

export function ToolsSection({ servers, skills, canEdit, isLocal }: Props) {
  const t = useT();
  const router = useRouter();
  const needsCode = useNeedsCode();
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const own = skills.filter((s) => s.source !== "builtin");

  const approve = async (url: string, ok: string) => {
    setBusy(true);
    const r = await postJson(url, code ? { code } : {});
    setBusy(false);
    setMsg(r.status === 200 ? { ok: true, text: ok } : { ok: false, text: r.body.error === "second_factor_required" ? t("mcp.needCode") : errorText(t, r) });
    if (r.status === 200) router.refresh();
  };

  return (
    <div className="space-y-6 p-4">
      <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("tt.searchPlaceholder")} aria-label={t("tt.search")} type="search" />

      <section aria-labelledby="tt-builtin">
        <h3 id="tt-builtin" className="font-display text-sm font-semibold">{t("tt.builtin")}</h3>
        <p className="mb-2 text-sm text-mute">{t("tt.builtinHint")}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {BUILTIN_TOOLS.filter((b) => matches(q, b.name, t(b.key))).map((b) => (
            <li key={b.name} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <span aria-hidden="true" className="mt-1.5 size-2 rounded-full bg-ok" />
              <span><span className="font-mono text-xs">{b.name}</span> <span className="text-[11px] text-ok">{t("tt.on")}</span><span className="block text-xs text-mute">{t(b.key)}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tt-connected">
        <h3 id="tt-connected" className="font-display text-sm font-semibold">{t("tt.connected")}</h3>
        {servers.length + own.length === 0 && <p className="text-sm text-mute">{t("tt.noneConnected")}</p>}
        <ul className="divide-y divide-line">
          {servers.filter((s) => matches(q, s.name, s.origin)).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="font-mono text-xs">{s.name}@{s.version ?? "?"}</span>
              <span className="text-xs text-mute">{t("tt.kind.mcp")} · {s.origin ?? t(`tt.sourceCol.${s.source}` as Key)}</span>
              <span className={`text-xs ${s.vet_status === "approved" ? "text-ok" : s.vet_status === "blocked" ? "text-bad" : "text-warn"}`}>{t(`mcp.status.${s.vet_status}` as Key)}</span>
              {s.secrets.length > 0 && <span className="text-xs text-mute">{t("tt.needsSecrets", { names: s.secrets.join(", ") })}</span>}
              {s.vet_findings.length > 0 && <span className="text-xs text-bad">{s.vet_findings.map((f) => `${f.tool}: ${t(`mcp.finding.${f.reason}` as Key)}`).join(" · ")}</span>}
              {canEdit && (s.vet_status === "pending" || s.vet_status === "blocked") && <button type="button" className={btn.secondary} disabled={busy} onClick={() => void approve(`/api/mcp/${s.id}/approve`, t("mcp.vetting"))}>{t("mcp.approve")}</button>}
            </li>
          ))}
          {own.filter((s) => matches(q, s.name, s.description, s.origin)).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="font-mono text-xs">{s.name}</span>
              <span className="text-xs text-mute">{t("tt.kind.skill")} · {s.origin ?? t(`tools.source.${s.source}` as Key)}</span>
              {s.blocked_reason ? <span className="text-xs text-bad">{t("tt.skillBlocked", { reason: s.blocked_reason })}</span> : <span className={`text-xs ${s.approved ? "text-ok" : "text-warn"}`}>{t(s.approved ? "mcp.status.approved" : "mcp.status.pending")}</span>}
              {canEdit && s.source === "user" && !s.approved && !s.blocked_reason && <button type="button" className={btn.secondary} disabled={busy} onClick={() => void approve(`/api/skills/${s.id}/approve`, t("tt.skillApproved"))}>{t("tt.approveSkill")}</button>}
            </li>
          ))}
        </ul>
        {needsCode && canEdit && <label className="mt-2 block max-w-xs text-xs">{t("mcp.code")}<input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      </section>

      {canEdit ? <AddFrom /> : <p className="text-sm text-mute">{t("tt.askOwner")}</p>}
      {canEdit && isLocal && <LocalFound />}
    </div>
  );
}
