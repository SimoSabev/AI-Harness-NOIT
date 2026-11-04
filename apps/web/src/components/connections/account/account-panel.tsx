"use client";
import { useCallback, useEffect, useState } from "react";
import { AccountDevice, AccountStatus } from "@mandat/contract";
import type { SyncPass } from "@mandat/sync";
import { z } from "zod";
import { useT } from "../../../i18n/client";
import { rich } from "../../../i18n/rich";
import { LOCALE } from "../../../i18n/t";
import { ACCOUNT_ERRORS, accountView } from "../../../lib/account-view";
import { errorText, postJson } from "../../../lib/client/api";
import { btn, card, input } from "../../ui";

// D-498: "Profile and sync" — the optional account, on its own. Signing in opens the sync server's page in the system
// browser (a new tab; the desktop window hands every outside link to the system browser, window-guard.ts). Nothing
// here ever holds the session token or the vault key: the local server keeps them.
type Reply = { status: number; body: Record<string, unknown> };
const Devices = z.object({ devices: z.array(AccountDevice) });

export function AccountPanel() {
  const t = useT();
  const [s, setS] = useState<AccountStatus | null>(null);
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [pass, setPass] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const when = (iso: string) => new Date(iso).toLocaleString(LOCALE[t.lang]);

  const apply = useCallback((r: Reply): boolean => {
    const p = AccountStatus.safeParse(r.body);
    if (r.status === 200 && p.success) {
      setErr(null);
      setS(p.data);
      return true;
    }
    if (r.status !== 200) setErr(errorText(t, r, ACCOUNT_ERRORS));
    return false;
  }, [t]);
  const load = useCallback(async () => {
    const r = await fetch("/api/account/status", { credentials: "same-origin", cache: "no-store" });
    apply({ status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> });
  }, [apply]);
  useEffect(() => void load(), [load]);

  const v = s ? accountView(s) : null;
  useEffect(() => {
    if (v?.show !== "pending") return;
    const id = setInterval(() => void postJson("/api/account/poll", {}).then(apply), v.pollMs);
    return () => clearInterval(id);
  }, [v?.show, apply]);
  useEffect(() => {
    if (v?.show !== "signed_in") return;
    void fetch("/api/account/devices", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((b: unknown) => setDevices(Devices.safeParse(b).data?.devices ?? []))
      .catch(() => setDevices([]));
  }, [v?.show]);

  const act = async (op: string, body: unknown = {}) => {
    setBusy(true);
    setNote(null);
    const r = await postJson(`/api/account/${op}`, body);
    setBusy(false);
    return r;
  };
  const start = async () => {
    const r = await act("start");
    if (apply(r) && r.body.state === "pending") window.open(String(r.body.verificationUrl), "_blank", "noopener,noreferrer");
  };
  const sync = async () => {
    const r = await act("sync");
    if (r.status !== 200) return setErr(errorText(t, r, ACCOUNT_ERRORS));
    const p = r.body as SyncPass;
    if (p.state === "ok") setNote([t("account.synced", { pulled: p.pulled, pushed: p.pushed }), p.conflicts.length > 0 ? t("account.conflicts", { n: p.conflicts.length }) : ""].join(" ").trim());
    await load();
  };
  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act("vault", { passphrase: pass });
    setPass("");
    apply(r);
  };
  const wipe = async () => {
    if (!window.confirm(t("account.deleteConfirm"))) return;
    apply(await act("wipe", { confirm: "delete" }));
  };

  if (!s || !v) return <section aria-busy="true" className={`${card} p-5`} />;
  return (
    <section aria-labelledby="account-title" className={`${card} p-5`}>
      <h2 id="account-title" className="font-display text-base font-semibold">{t(v.title)}</h2>
      <p className="mt-1 text-sm text-mute">{t("account.intro")}</p>
      {v.show === "unconfigured" && <p className="mt-3 text-sm">{rich(t("account.unconfigured"), { env: <code className="font-mono">MANDAT_SYNC_URL</code> })}</p>}
      {v.show === "off" && (
        <div className="mt-3 space-y-3">
          <p className="text-sm">{t(v.note)}</p>
          <button className={btn.primary} type="button" disabled={busy} onClick={() => void start()}>{t("account.signIn")}</button>
        </div>
      )}
      {v.show === "pending" && s.state === "pending" && (
        <div className="mt-3 space-y-3" role="status">
          <p className="text-sm">{t(v.note)}</p>
          <p className="select-all rounded-lg bg-raised px-3 py-2 text-center font-mono text-lg tracking-widest">{s.userCode}</p>
          <p className="flex flex-wrap gap-3">
            <a className={btn.secondary} href={s.verificationUrl} target="_blank" rel="noopener noreferrer">{t("account.openBrowser")}</a>
            <button className={btn.ghost} type="button" onClick={() => void act("signout").then(apply)}>{t("account.cancel")}</button>
          </p>
        </div>
      )}
      {v.show === "signed_in" && s.state === "signed_in" && (
        <div className="mt-3 space-y-4">
          <p className="text-sm">{t("account.signedInAs", { email: s.email })}</p>
          <p className="text-sm text-mute">{s.lastSync ? t("account.lastSync", { when: when(s.lastSync) }) : t("account.never")}</p>
          <p className="text-sm">{t(v.note)}</p>
          {v.needsVault && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void unlock(e)}>
              <label className="text-sm">
                <span className="block font-medium">{t("account.passphrase")}</span>
                <input className={`${input} mt-1.5 w-72 max-w-full`} type="password" autoComplete="new-password" minLength={10} value={pass} onChange={(e) => setPass(e.target.value)} required />
                <span className="mt-1 block text-xs text-mute">{t("account.passphraseHint")}</span>
              </label>
              <button className={btn.secondary} type="submit" disabled={busy || pass.length < 10}>{t("account.unlock")}</button>
            </form>
          )}
          <button className={btn.primary} type="button" disabled={busy} onClick={() => void sync()}>{t("account.syncNow")}</button>
          <div>
            <h3 className="font-display text-sm font-semibold">{t("account.devices")}</h3>
            {devices.length === 0 ? <p className="text-sm text-mute">{t("account.devicesNone")}</p> : (
              <ul className="mt-1 space-y-1 text-sm">
                {devices.map((d) => <li key={d.id}>{d.label || "—"}{d.current && <span className="text-mute"> · {t("account.thisDevice")}</span>} <span className="text-mute">· {t("account.lastSeen", { when: when(d.lastSeen) })}</span></li>)}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-3 border-t border-line pt-4">
            <button className={btn.secondary} type="button" disabled={busy} onClick={() => void act("signout").then(apply)}>{t("account.signOut")}</button>
            <button className={btn.secondary} type="button" disabled={busy} onClick={() => void act("signout-all").then(apply)}>{t("account.signOutAll")}</button>
            <button className={btn.danger} type="button" disabled={busy} onClick={() => void wipe()}>{t("account.delete")}</button>
          </div>
          <p className="text-xs text-mute">{t("account.signOutNote")}</p>
        </div>
      )}
      {note && <p className="mt-3 text-sm text-ok" role="status">{note}</p>}
      {err && <p className="mt-3 text-sm text-bad" role="alert">{err}</p>}
    </section>
  );
}
