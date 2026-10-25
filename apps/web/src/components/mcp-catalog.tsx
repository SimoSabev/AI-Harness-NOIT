"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { useNeedsCode } from "./second-factor";
import { btn, input } from "./ui";

export interface CatalogRow { id: string; name: string; version: string | null; source: string; vet_status: string; vet_findings: { tool: string; reason: string }[]; egress_hosts: string[] }
interface Found { name: string; description: string; versions: string[] }

// E8e (v5 p. 4.5, AC-5.1/5.2): add an MCP server from the official registry with an exact version, then approve it
// (a code when it reaches beyond localhost). The worker vets it; findings block it and are shown with the tool named.
export function McpCatalog({ rows }: { rows: CatalogRow[] }) {
  const router = useRouter();
  const t = useT();
  const needsCode = useNeedsCode();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [pick, setPick] = useState<{ server: Found; version: string; name: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await fetch(`/api/mcp/registry?q=${encodeURIComponent(q)}`, { credentials: "same-origin" });
    setBusy(false);
    const body = (await r.json().catch(() => ({}))) as { servers?: Found[] };
    setFound(r.ok ? (body.servers ?? []) : []);
    if (!r.ok) setMsg({ ok: false, text: t("mcp.registryDown") });
  };
  const add = async () => {
    if (!pick) return;
    setBusy(true);
    const r = await postJson("/api/mcp", { source: "registry", registry_name: pick.server.name, version: pick.version, name: pick.name });
    setBusy(false);
    setMsg(r.status === 201 ? { ok: true, text: t("mcp.added") } : { ok: false, text: errorText(t, r) });
    if (r.status === 201) {
      setPick(null);
      router.refresh();
    }
  };
  const approve = async (id: string) => {
    setBusy(true);
    const r = await postJson(`/api/mcp/${id}/approve`, code ? { code } : {});
    setBusy(false);
    setMsg(r.status === 200 ? { ok: true, text: t("mcp.vetting") } : { ok: false, text: r.body.error === "second_factor_required" ? t("mcp.needCode") : errorText(t, r) });
    if (r.status === 200) router.refresh();
  };

  return (
    <div className="space-y-3 border-t border-line p-4">
      <h3 className="text-sm font-medium">{t("mcp.catalog")}</h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{r.name}@{r.version ?? "?"}</span>
            <span className="text-xs text-mute">{t(`mcp.status.${r.vet_status}` as Key)}</span>
            {r.vet_findings.length > 0 && <span className="text-xs text-bad">{r.vet_findings.map((f) => `${f.tool}: ${t(`mcp.finding.${f.reason}` as Key)}`).join(" · ")}</span>}
            {(r.vet_status === "pending" || r.vet_status === "blocked") && <button type="button" className={btn.secondary} disabled={busy} onClick={() => void approve(r.id)}>{t("mcp.approve")}</button>}
          </li>
        ))}
      </ul>
      {needsCode && <label className="block max-w-xs text-xs">{t("mcp.code")}<input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>}
      <form onSubmit={(e) => void search(e)} className="flex gap-2">
        <input className={`${input} flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("mcp.searchPlaceholder")} aria-label={t("mcp.search")} />
        <button type="submit" className={btn.secondary} disabled={busy}>{t("mcp.search")}</button>
      </form>
      {found && (
        <ul className="space-y-1">
          {found.length === 0 && <li className="text-xs text-mute">{t("mcp.none")}</li>}
          {found.map((f) => (
            <li key={f.name}><button type="button" className="text-left text-sm underline-offset-2 hover:underline" onClick={() => setPick({ server: f, version: f.versions[0] ?? "", name: (f.name.split("/").pop() ?? "mcp").toLowerCase().replace(/[^a-z0-9_.-]/g, "-").slice(0, 63) })}><span className="font-mono text-xs">{f.name}</span> <span className="text-xs text-mute">{f.description}</span></button></li>
          ))}
        </ul>
      )}
      {pick && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">{t("mcp.version")}<select className={`${input} mt-1`} value={pick.version} onChange={(e) => setPick({ ...pick, version: e.target.value })}>{pick.server.versions.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="text-xs">{t("mcp.name")}<input className={`${input} mt-1 font-mono`} value={pick.name} onChange={(e) => setPick({ ...pick, name: e.target.value })} /></label>
          <button type="button" className={btn.primary} disabled={busy} onClick={() => void add()}>{t("mcp.add")}</button>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
