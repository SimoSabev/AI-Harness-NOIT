"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import { useNeedsCode } from "./second-factor";
import { btn, input } from "./ui";

// v5 E9b (D5, D-362): a person's hidden tests — Mandat copies them into the checked tree only; the agent never sees them.
// Upload = a new version (approve.rules + a fresh authenticator code); the page shows versions, counts and hashes only.
export function HiddenTestsPanel({ repoId, sets, canUpload }: { repoId: string; sets: { version: number; files: number; hash: string; created_at: string }[]; canUpload: boolean }) {
  const router = useRouter();
  const t = useT();
  const needsCode = useNeedsCode();
  const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (list: FileList | null) => {
    const out: { path: string; content: string }[] = [];
    for (const f of Array.from(list ?? [])) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      out.push({ path: rel.includes("/") ? rel.split("/").slice(1).join("/") : rel, content: await f.text() });
    }
    setFiles(out);
  };
  const upload = async () => {
    setBusy(true);
    setMsg(null);
    const r = await postJson(`/api/repos/${repoId}/hidden`, { files, ...(code ? { code } : {}) });
    setBusy(false);
    if (r.status !== 201) {
      setMsg({ ok: false, text: errorText(t, r) });
      return;
    }
    setFiles([]);
    setCode("");
    setMsg({ ok: true, text: t("hidden.uploaded", { v: Number(r.body.version) }) });
    router.refresh();
  };
  return (
    <section className="mt-5 rounded-lg border border-line p-4 text-sm" aria-labelledby={`hidden-h-${repoId}`}>
      <h3 id={`hidden-h-${repoId}`} className="font-medium">{t("hidden.title")}</h3>
      <p className="mt-1 text-mute">{t("hidden.explain")}</p>
      {sets.length > 0 ? (
        <ul className="mt-2 space-y-1">{sets.map((s) => <li key={s.version} className="font-mono text-xs">v{s.version} · {t("hidden.files", { n: s.files })} · {s.hash.slice(0, 19)}… · {s.created_at.slice(0, 16).replace("T", " ")}</li>)}</ul>
      ) : <p className="mt-2 text-mute">{t("hidden.none")}</p>}
      {canUpload && (
        <div className="mt-3 space-y-2">
          <label className="block">{t("hidden.pick")}
            <input className={`${input} mt-1`} type="file" multiple accept=".ts,.tsx,.js,.mjs,.cjs,.jsx" onChange={(e) => void pick(e.target.files)} />
          </label>
          {files.length > 0 && <p className="text-xs text-mute">{t("hidden.selected", { n: files.length })}</p>}
          {needsCode && <label className="block"><span className="font-medium">{t("hidden.code")}</span>
            <input className={`${input} mt-1 max-w-40 font-mono tracking-widest`} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>}
          <button type="button" className={btn.primary} disabled={busy || files.length === 0 || (needsCode && code.length !== 6)} onClick={() => void upload()}>{t("hidden.upload")}</button>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </section>
  );
}
