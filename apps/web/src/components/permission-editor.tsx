"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import { btn, input } from "./ui";

// E8g (v5 p. 4.4 (1)): the matrix is editable by tools.manage. A change that alters a repo's layer C is a new profile
// version; allowing net:* or git push needs a TOTP code (asked for only when the server says so).
export function PermissionEditor() {
  const router = useRouter();
  const t = useT();
  const [subject, setSubject] = useState("any");
  const [tool, setTool] = useState("");
  const [decision, setDecision] = useState<"allow" | "ask" | "deny">("ask");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/tools/permissions", { subject: subject.trim(), tool: tool.trim(), decision, ...(code ? { code } : {}) });
    setBusy(false);
    if (r.status === 403 && r.body.error === "second_factor_required") setNeedCode(true);
    if (r.status !== 200) {
      setMsg({ ok: false, text: errorText(t, r) });
      return;
    }
    setCode("");
    setNeedCode(false);
    setMsg({ ok: true, text: t("tools.edit.saved", { n: Number(r.body.versions ?? 0) }) });
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t border-line p-4" aria-labelledby="perm-edit-h">
      <h3 id="perm-edit-h" className="text-sm font-medium">{t("tools.edit.title")}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">{t("tools.edit.subject")}<input className={`${input} mt-1 font-mono`} value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={64} placeholder="any · agent:claude · night" /></label>
        <label className="block text-sm">{t("tools.edit.tool")}<input className={`${input} mt-1 font-mono`} value={tool} onChange={(e) => setTool(e.target.value)} required maxLength={160} placeholder="mcp:stripe.create_refund" /></label>
        <label className="block text-sm">{t("tools.edit.decision")}
          <select className={`${input} mt-1`} value={decision} onChange={(e) => setDecision(e.target.value as "allow" | "ask" | "deny")}>
            <option value="allow">{t("tools.perm.allow")}</option>
            <option value="ask">{t("tools.perm.ask")}</option>
            <option value="deny">{t("tools.perm.deny")}</option>
          </select>
        </label>
      </div>
      {needCode && (
        <label className="block max-w-xs text-sm">{t("tools.edit.code")}
          <input className={`${input} mt-1 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      <button type="submit" className={btn.primary} disabled={busy || tool.trim() === ""}>{t("tools.edit.save")}</button>
    </form>
  );
}
