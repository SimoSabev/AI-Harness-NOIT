"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROVIDERS } from "@mandat/contract";
import type { KeyCli, Connection, KeyCheck, ProviderGroup, ProviderId } from "@mandat/contract";
import { useT } from "../../../i18n/client";
import type { Key } from "../../../i18n/t";
import { errorText, postJson } from "../../../lib/client/api";
import { ModelPicker, initialModels } from "../../connections-ui";
import { StatusBadge, btn, card, input } from "../../ui";
import { addKeyBody, keyLooksRight, keyProviderGroups, keyRows, statusOf } from "./api-keys-view";
import type { KeyRow } from "./api-keys-view";

// D-475: Settings → API keys — every saved key (its name, the service, the last four characters, the last check, which
// agent can use it) and "Add a key". The key is sent once to `mandat local` (checked, sealed, handed to the proxy); the
// page keeps nothing of it after the call.

const ERR: Record<string, Key> = {
  bad_key: "conn.err.bad_key", unreachable: "conn.err.unreachable", bad_address: "conn.err.bad_address", bad_connection: "conn.err.bad_address",
  proxy_start_failed: "conn.err.proxy", control_unavailable: "error.keys_unavailable", keys_unavailable: "error.keys_unavailable", not_an_owner: "error.keys_not_an_owner",
  unknown_connection: "apikeys.err.gone",
};
const GROUP: Record<ProviderGroup, Key> = {
  subscription: "conn.group.subscription", main: "apikeys.group.main", china: "apikeys.group.china", router: "apikeys.group.router", cloud: "apikeys.group.cloud", local: "conn.group.local", own: "apikeys.group.own",
};
const AGENT: Record<KeyCli, string> = { claude: "Claude Code", codex: "Codex", gemini: "Gemini CLI" };

function AgentNote({ agent }: { agent: KeyCli | null }) {
  const t = useT();
  return agent === null
    ? <span className="text-xs text-warn">{t("apikeys.noAgent")}</span>
    : <span className="text-xs text-mute">{t("apikeys.usedBy", { agent: AGENT[agent] })}</span>;
}

function KeyItem({ row, canEdit, onChanged }: { row: KeyRow; canEdit: boolean; onChanged: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<KeyCheck | null>(row.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const badge = statusOf(status);
  const check = async () => {
    setBusy(true);
    setErr(null);
    const r = await postJson(`/api/connections/${encodeURIComponent(row.id)}/check`, {});
    setBusy(false);
    if (r.status === 200 && typeof r.body.status === "string") setStatus(r.body.status as KeyCheck);
    else setErr(errorText(t, r, ERR));
  };
  const remove = async () => {
    if (!window.confirm(t("apikeys.removeConfirm", { name: row.label }))) return;
    const r = await postJson(`/api/connections/${encodeURIComponent(row.id)}`, {}, "DELETE");
    if (r.status === 200) onChanged();
    else setErr(errorText(t, r, ERR));
  };
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{row.label}</span>
        <span className="text-xs text-mute">{row.provider}{row.hint ? ` · ${t("apikeys.keyEnding", { hint: row.hint })}` : ""}</span>
        <StatusBadge tone={badge.tone} label={t(badge.label)} />
        {canEdit && (
          <span className="ml-auto flex gap-2">
            <button type="button" className={btn.secondary} onClick={() => void check()} disabled={busy}>{busy ? t("conn.checking") : t("apikeys.check")}</button>
            <button type="button" className={btn.ghost} onClick={() => void remove()}>{t("conn.remove")}</button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <AgentNote agent={row.agent} />
        <span className="text-xs text-mute">{t("apikeys.defaultModel")} <span className="font-mono">{row.defaultModel}</span>{row.models.length > 1 ? ` +${row.models.length - 1}` : ""}</span>
        <Link href="/settings/models" className="text-xs text-accent underline-offset-4 hover:underline">{t("apikeys.editModels")}</Link>
        {!row.live && <a href={row.docs} target="_blank" rel="noopener noreferrer" className="text-xs text-mute underline">{t("apikeys.unverified")}</a>}
      </div>
      {status === "no_credit" && <p className="text-xs text-warn">{t("apikeys.noCreditHint")}</p>}
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
    </li>
  );
}

const FIRST: ProviderId = "anthropic";

function AddKey({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const [provider, setProvider] = useState<ProviderId>(FIRST);
  const info = PROVIDERS[provider];
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(info.baseUrl ?? "");
  const [m, setM] = useState(initialModels(provider, []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const pick = (p: ProviderId) => {
    setProvider(p);
    setBaseUrl(PROVIDERS[p].baseUrl ?? "");
    setM(initialModels(p, []));
    setMsg(null);
  };
  const ownAddress = provider === "custom" || provider === "openai-compat";
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // a short, broken or missing key is named as such (the server would only answer "bad body")
    if ((key.trim() !== "" || (info.auth !== "none" && !ownAddress)) && !keyLooksRight(key)) return setMsg({ text: t("error.bad_keys"), bad: true });
    const body = addKeyBody({ provider, label, key, baseUrl, models: m.models, defaultModel: m.defaultModel });
    if (body === null) return setMsg({ text: t("conn.modelsNone"), bad: true });
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/connections", body);
    setKey(""); // never kept in the page after the call
    setBusy(false);
    if (r.status === 200 && r.body.ok === true) {
      const c = r.body.connection as Connection | undefined;
      setMsg({ text: c?.check?.status === "no_credit" ? t("apikeys.savedNoCredit") : t("apikeys.savedOk", { name: c?.label ?? info.label }), bad: false });
      setLabel("");
      onSaved();
    } else setMsg({ text: errorText(t, r, ERR), bad: true });
  };
  return (
    <form className={`${card} space-y-4 p-5`} onSubmit={(e) => void save(e)} aria-labelledby="ak-add">
      <div>
        <h2 id="ak-add" className="font-display text-base font-semibold">{t("apikeys.add.title")}</h2>
        <p className="mt-1 text-sm text-mute">{t("apikeys.add.hint")}</p>
      </div>
      <label className="block text-sm">
        <span className="font-medium">{t("apikeys.provider")}</span>
        <select className={`${input} mt-1.5`} value={provider} onChange={(e) => pick(e.target.value as ProviderId)}>
          {keyProviderGroups().map((g) => (
            <optgroup key={g.group} label={t(GROUP[g.group])}>
              {g.ids.map((id) => <option key={id} value={id}>{PROVIDERS[id].label}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="mt-1.5 block"><AgentNote agent={info.agent} /></span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">{t("apikeys.label")}</span>
        <input className={`${input} mt-1.5`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={t("apikeys.labelPlaceholder")} />
      </label>
      {info.baseUrl === null && (
        <label className="block text-sm">
          <span className="font-medium">{t("conn.address")}</span>
          <input className={`${input} mt-1.5 font-mono`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" required />
          <span className="mt-1 block text-xs text-mute">{t(provider === "custom" ? "conn.addressHint" : provider === "openai-compat" ? "apikeys.addressCompat" : "apikeys.addressConsole")}</span>
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium">{t("conn.key")}</span>
        <input className={`${input} mt-1.5 font-mono`} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} required={!ownAddress} minLength={20} maxLength={512} />
        <span className="mt-1 block text-xs text-mute">
          {t("conn.keyPrivacy")}{" "}
          {info.keyPage && <a href={info.keyPage} target="_blank" rel="noopener noreferrer" className="underline">{t("conn.getKey")}</a>}
        </span>
      </label>
      <details>
        <summary className="cursor-pointer text-sm text-mute hover:text-ink">{t("apikeys.chooseModels", { model: m.defaultModel || "—" })}</summary>
        <div className="mt-3"><ModelPicker key={provider} provider={provider} models={m.models} defaultModel={m.defaultModel} onChange={(models, defaultModel) => setM({ models, defaultModel })} /></div>
      </details>
      {!info.live && <p className="text-xs text-mute">{t("conn.unverified")} <a href={info.docs} target="_blank" rel="noopener noreferrer" className="underline">{t("conn.docs")}</a></p>}
      <button type="submit" className={btn.primary} disabled={busy}>{busy ? t("conn.checking") : t("conn.checkSave")}</button>
      {msg && <p className={`text-sm ${msg.bad ? "text-bad" : "text-ok"}`} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
    </form>
  );
}

/** The API keys section: the saved keys, then the add form (owners only). */
export function ApiKeysPanel({ connections, canEdit }: { connections: Connection[]; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const rows = keyRows(connections);
  return (
    <div className="space-y-6">
      <section aria-labelledby="ak-list">
        <h2 id="ak-list" className="mb-2 font-display text-sm font-medium tracking-wide text-mute">{t("apikeys.list")}</h2>
        {rows.length === 0
          ? <p className={`${card} p-5 text-sm text-mute`}>{t("apikeys.none")}</p>
          : <ul className={`${card} divide-y divide-line`}>{rows.map((r) => <KeyItem key={`${r.id}:${r.status ?? ""}`} row={r} canEdit={canEdit} onChanged={() => router.refresh()} />)}</ul>}
      </section>
      {canEdit && <AddKey onSaved={() => router.refresh()} />}
    </div>
  );
}
