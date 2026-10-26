"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginState } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { csrfToken, errorText, postJson } from "../lib/client/api";
import { loginView } from "../lib/login-view";
import { btn, input } from "./ui";

const ERR: Record<string, Key> = { keys_unavailable: "error.keys_unavailable", not_an_owner: "error.keys_not_an_owner" };

// D-369, D-387: `mandat login` from the web, one button. The unchanged Claude Code runs in a container of `pnpm local`; this form shows
// Anthropic's sign-in address and passes the pasted code on. The code field clears itself; nothing is kept here.
// D-393: `cli` = "codex" signs in to ChatGPT (`codex login --device-auth`): OpenAI's page and a one-time code to type there.
export function AccountLogin({ suggested, cli = "claude", onDone }: { suggested: string; cli?: "claude" | "codex"; onDone?: (name: string) => void }) {
  const router = useRouter();
  const t = useT();
  const [s, setS] = useState<LoginState>({ state: "idle" });
  const [name, setName] = useState(suggested);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const v = loginView(s);

  const apply = (r: { status: number; body: Record<string, unknown> }) => {
    const p = LoginState.safeParse(r.body);
    if (r.status === 200 && p.success) {
      setErr(null);
      // D-393: one sign-in runs at a time in `mandat local`; this panel shows only its own account's (Claude and ChatGPT side by side)
      if (p.data.state !== "idle" && p.data.name !== name.trim()) return setS({ state: "idle" });
      setS(p.data);
      if (p.data.state === "done") {
        onDone?.(p.data.name);
        router.refresh();
      }
    } else setErr(errorText(t, r, ERR));
  };
  const get = async () => {
    const r = await fetch("/api/accounts/login", { credentials: "same-origin", cache: "no-store" });
    apply({ status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> });
  };
  useEffect(() => {
    void get(); // once on mount: resume a login that is already running
  }, []);
  useEffect(() => {
    if (!v.poll) return;
    const id = setInterval(() => void get(), 1500);
    return () => clearInterval(id);
  }, [v.poll]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    apply(await postJson("/api/accounts/login", { name: name.trim(), ...(cli === "codex" ? { cli } : {}) }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await postJson("/api/accounts/login/code", { code: code.trim() });
    setCode("");
    apply(r);
  };
  const cancel = async () => {
    const r = await fetch("/api/accounts/login", { method: "DELETE", headers: { "x-mandat-csrf": csrfToken() }, credentials: "same-origin" });
    apply({ status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> });
  };

  const note = v.note && (s.state === "done" ? t(v.note, { who: s.email ?? s.name, plan: s.plan ?? t("agent.subscription"), name: s.name, agent: `${cli}@${s.name}` }) : t(v.note));
  return (
    <div className="mt-3 space-y-3">
      {v.show === "form" && (
        // D-387: one button; the account's name has a default and is changed only by whoever wants to
        <form className="space-y-3" onSubmit={(e) => void start(e)}>
          <button className={btn.primary} type="submit">{t(cli === "codex" ? "keys.login.startChatgpt" : "keys.login.start")}</button>
          <details className="text-sm">
            <summary className="cursor-pointer text-mute hover:text-ink">{t("keys.login.nameOther")}</summary>
            <label className="mt-2 block">
              <span className="font-medium">{t("keys.login.name")}</span>
              <input className={`${input} mt-1.5 w-44 font-mono`} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} pattern="[a-z0-9][a-z0-9\-]{0,31}" maxLength={32} required />
            </label>
          </details>
        </form>
      )}
      {v.show === "wait" && <p className="text-sm text-mute" role="status">{note}</p>}
      {v.show === "code" && s.state === "waiting_code" && (
        <div className="space-y-3">
          <p className="text-sm">{t("keys.login.step1")}</p>
          <a className={btn.secondary} href={s.url} target="_blank" rel="noopener noreferrer">{t("keys.login.open")}</a>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void submit(e)}>
            <label className="text-sm">
              <span className="block">{t("keys.login.step2")}</span>
              <input className={`${input} mt-1.5 w-80 max-w-full font-mono`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} required aria-label={t("keys.login.code")} />
            </label>
            <button className={btn.primary} type="submit" disabled={code.trim().length < 8}>{t("keys.login.submit")}</button>
            <button className={btn.ghost} type="button" onClick={() => void cancel()}>{t("keys.login.cancel")}</button>
          </form>
        </div>
      )}
      {v.show === "device" && s.state === "waiting_device" && (
        <div className="space-y-3">
          <p className="text-sm">{t("keys.login.device1")}</p>
          <a className={btn.secondary} href={s.url} target="_blank" rel="noopener noreferrer">{t("keys.login.openChatgpt")}</a>
          <p className="text-sm">{t("keys.login.device2")}</p>
          <p className="select-all rounded-lg bg-raised px-3 py-2 text-center font-mono text-lg tracking-widest" aria-label={t("keys.login.code")}>{s.code}</p>
          <p className="text-xs text-mute" role="status">{t("keys.login.deviceWait")}</p>
          <button className={btn.ghost} type="button" onClick={() => void cancel()}>{t("keys.login.cancel")}</button>
        </div>
      )}
      {v.show === "form" && note && <p className={`text-sm ${s.state === "failed" ? "text-bad" : "text-ok"}`} role={s.state === "failed" ? "alert" : "status"}>{note}</p>}
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      <p className="text-xs text-mute">{t(cli === "codex" ? "keys.login.privacyChatgpt" : "keys.login.privacy")}</p>
    </div>
  );
}

export function AccountLogout({ name }: { name: string }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!window.confirm(t("keys.logoutConfirm", { name }))) return;
    setBusy(true);
    await postJson("/api/accounts/logout", { name });
    setBusy(false);
    router.refresh();
  };
  return <button className={btn.ghost} type="button" disabled={busy} onClick={() => void remove()}>{t("keys.logout")}</button>;
}
