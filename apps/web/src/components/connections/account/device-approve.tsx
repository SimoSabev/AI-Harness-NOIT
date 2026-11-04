"use client";
import { useEffect, useState } from "react";
import { useT } from "../../../i18n/client";
import { btn, card } from "../../ui";

// D-495: the sync server's page that a device's "Sign in" opens in the system browser. The person signs in here
// (GitHub, Google), sees the code the device shows, and approves or denies. Calls go to Better Auth on this same
// origin with the browser's own httpOnly cookie; nothing here is stored in the page.
type Phase = "loading" | "signin" | "ask" | "done" | "denied" | "error";
const AUTH = "/api/account-auth";
const CODE = /^[A-Z0-9-]{4,16}$/;

export function DeviceApprove({ methods }: { methods: { github: boolean; google: boolean } }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("loading");
  const [code, setCode] = useState("");

  useEffect(() => {
    const c = (new URLSearchParams(window.location.search).get("user_code") ?? "").toUpperCase();
    if (!CODE.test(c)) return setPhase("error");
    setCode(c);
    void (async () => {
      const me = (await (await fetch(`${AUTH}/get-session`, { credentials: "same-origin", cache: "no-store" })).json().catch(() => null)) as unknown;
      if (!me) return setPhase("signin");
      const claim = await fetch(`${AUTH}/device?user_code=${encodeURIComponent(c)}`, { credentials: "same-origin", cache: "no-store" });
      setPhase(claim.ok ? "ask" : "error");
    })();
  }, []);

  const social = async (provider: "github" | "google") => {
    const r = await fetch(`${AUTH}/sign-in/social`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, callbackURL: `/account/device?user_code=${encodeURIComponent(code)}` }) });
    const b = (await r.json().catch(() => ({}))) as { url?: string };
    if (b.url && /^https:\/\//.test(b.url)) window.location.assign(b.url);
    else setPhase("error");
  };
  const decide = async (approve: boolean) => {
    const r = await fetch(`${AUTH}/device/${approve ? "approve" : "deny"}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ userCode: code }) });
    setPhase(!r.ok ? "error" : approve ? "done" : "denied");
  };

  return (
    <div className={`${card} space-y-4 p-6`}>
      {phase === "signin" && (
        <>
          <p className="text-sm">{t("device.signIn")}</p>
          {!methods.github && !methods.google && <p className="text-sm text-mute">{t("device.noMethods")}</p>}
          {methods.github && <button className={`${btn.primary} w-full`} type="button" onClick={() => void social("github")}>{t("device.github")}</button>}
          {methods.google && <button className={`${btn.secondary} w-full`} type="button" onClick={() => void social("google")}>{t("device.google")}</button>}
        </>
      )}
      {phase === "ask" && (
        <>
          <p className="text-sm">{t("device.intro")}</p>
          <p className="select-all rounded-lg bg-raised px-3 py-2 text-center font-mono text-lg tracking-widest">{code}</p>
          <p className="flex gap-3">
            <button className={btn.primary} type="button" onClick={() => void decide(true)}>{t("device.approve")}</button>
            <button className={btn.secondary} type="button" onClick={() => void decide(false)}>{t("device.deny")}</button>
          </p>
        </>
      )}
      {phase === "done" && <p className="text-sm text-ok" role="status">{t("device.done")}</p>}
      {phase === "denied" && <p className="text-sm" role="status">{t("device.denied")}</p>}
      {phase === "error" && <p className="text-sm text-bad" role="alert">{t("device.err")}</p>}
    </div>
  );
}
