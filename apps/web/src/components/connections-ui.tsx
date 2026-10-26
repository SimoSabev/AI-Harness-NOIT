"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModelId, PROVIDERS } from "@mandat/contract";
import type { Connection, DetectReply, ProviderId } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import type { TaskAgent } from "../lib/agents";
import { csrfToken, errorText, postJson } from "../lib/client/api";
import { AccountLogin } from "./account-login";
import { StatusBadge, btn, card, input } from "./ui";

// D-393: the first-run page (/welcome) and Settings → Models. One flow, like the onboarding of coding harnesses: pick what
// you have (a subscription, an API key, a model on this computer), connect each in place, choose the default. Keys go to
// `mandat local` once (checked against the provider, sealed, handed to the proxy) and are never shown again.

const ERR: Record<string, Key> = {
  bad_key: "conn.err.bad_key", unreachable: "conn.err.unreachable", bad_address: "conn.err.bad_address", bad_connection: "conn.err.bad_address",
  proxy_start_failed: "conn.err.proxy", control_unavailable: "error.keys_unavailable", keys_unavailable: "error.keys_unavailable", not_an_owner: "error.keys_not_an_owner",
};
const GROUPS: { title: Key; ids: ProviderId[] }[] = [
  { title: "conn.group.subscription", ids: ["claude-sub", "chatgpt-sub"] },
  { title: "conn.group.key", ids: ["anthropic", "openai", "deepseek", "kimi", "zai", "custom"] },
  { title: "conn.group.local", ids: ["ollama", "lmstudio"] },
];
const TIER: Record<"best" | "balanced" | "fast", Key> = { best: "conn.tier.best", balanced: "conn.tier.balanced", fast: "conn.tier.fast" };

async function send(url: string, method: "PUT" | "DELETE", body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json", "x-mandat-csrf": csrfToken() }, credentials: "same-origin", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** The models of a connection: the catalog's suggestions, what the server reports, and any id the person adds; one default. */
export function ModelPicker({ provider, available = [], models, defaultModel, onChange }: { provider: ProviderId; available?: string[]; models: string[]; defaultModel: string; onChange: (models: string[], defaultModel: string) => void }) {
  const t = useT();
  const [extra, setExtra] = useState("");
  const suggested = PROVIDERS[provider].models;
  const all = [...new Set([...suggested.map((m) => m.id), ...available, ...models])];
  const toggle = (id: string) => {
    const next = models.includes(id) ? models.filter((m) => m !== id) : [...models, id];
    if (next.length === 0) return;
    onChange(next, next.includes(defaultModel) ? defaultModel : (next[0] as string));
  };
  const add = () => {
    const id = extra.trim();
    if (!ModelId.safeParse(id).success) return;
    setExtra("");
    if (!models.includes(id)) onChange([...models, id], models.length === 0 ? id : defaultModel);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("conn.models")}</legend>
      {all.length === 0 && <p className="text-sm text-mute">{t("conn.modelsNone")}</p>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {all.map((id) => {
          const s = suggested.find((m) => m.id === id);
          return (
            <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input type="checkbox" checked={models.includes(id)} onChange={() => toggle(id)} />
                <span className="truncate font-mono">{id}</span>
                {s && <span className="text-xs text-mute">{t(TIER[s.tier])}</span>}
                {s?.recommended && <StatusBadge tone="green" label={t("conn.recommended")} />}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-mute">
                <input type="radio" name={`default-${provider}`} checked={defaultModel === id} disabled={!models.includes(id)} onChange={() => onChange(models, id)} />
                {t("conn.default")}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <input className={`${input} font-mono`} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t("conn.addModel")} aria-label={t("conn.addModel")} maxLength={128}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className={btn.secondary} onClick={add} disabled={!ModelId.safeParse(extra.trim()).success}>{t("conn.add")}</button>
      </div>
    </fieldset>
  );
}

const initialModels = (p: ProviderId, available: string[]): { models: string[]; defaultModel: string } => {
  const rec = PROVIDERS[p].models.filter((m) => m.recommended).map((m) => m.id);
  const models = rec.length > 0 ? rec : available.slice(0, 1);
  return { models, defaultModel: models[0] ?? "" };
};

/** Connect one key-taking or local provider: address (custom), key, models → checked and saved by `mandat local`. */
function KeyConnect({ provider, available, onSaved }: { provider: ProviderId; available: string[]; onSaved: () => void }) {
  const t = useT();
  const info = PROVIDERS[provider];
  const [m, setM] = useState(initialModels(provider, available));
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(info.baseUrl ?? "");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const needsKey = info.auth !== "none" && provider !== "custom";
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      provider, models: m.models, defaultModel: m.defaultModel,
      ...(key.trim() ? { key: key.trim() } : {}), ...(info.baseUrl === null || baseUrl !== info.baseUrl ? { baseUrl: baseUrl.trim() } : {}),
      ...(provider === "custom" && label.trim() ? { label: label.trim(), id: label.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "custom" } : {}),
    };
    const r = await postJson("/api/connections", body);
    setKey(""); // never kept in the page after the call
    setBusy(false);
    if (r.status === 200 && r.body.ok === true) {
      setDone(true);
      onSaved();
    } else setErr(errorText(t, r, ERR));
  };
  if (done) return <p className="text-sm text-ok" role="status">{t("conn.saved", { name: info.label })}</p>;
  return (
    <form className="space-y-4" onSubmit={(e) => void save(e)}>
      {(provider === "custom" || info.kind === "local") && (
        <label className="block text-sm">
          <span className="font-medium">{t("conn.address")}</span>
          <input className={`${input} mt-1.5 font-mono`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" required />
          <span className="mt-1 block text-xs text-mute">{t(info.kind === "local" ? "conn.addressLocal" : "conn.addressHint")}</span>
        </label>
      )}
      {provider === "custom" && (
        <label className="block text-sm">
          <span className="font-medium">{t("conn.name")}</span>
          <input className={`${input} mt-1.5`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={32} required />
        </label>
      )}
      {info.auth !== "none" && (
        <label className="block text-sm">
          <span className="font-medium">{t("conn.key")}</span>
          <input className={`${input} mt-1.5 font-mono`} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} required={needsKey} minLength={20} maxLength={512} />
          <span className="mt-1 block text-xs text-mute">
            {t("conn.keyPrivacy")}{" "}
            {info.keyPage && <a href={info.keyPage} target="_blank" rel="noopener noreferrer" className="underline">{t("conn.getKey")}</a>}
          </span>
        </label>
      )}
      <ModelPicker provider={provider} available={available} models={m.models} defaultModel={m.defaultModel} onChange={(models, defaultModel) => setM({ models, defaultModel })} />
      {!info.live && <p className="text-xs text-mute">{t("conn.unverified")} <a href={info.docs} target="_blank" rel="noopener noreferrer" className="underline">{t("conn.docs")}</a></p>}
      <button type="submit" className={btn.primary} disabled={busy || m.models.length === 0}>{busy ? t("conn.checking") : t(info.auth === "none" ? "conn.save" : "conn.checkSave")}</button>
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
    </form>
  );
}

function ProviderCard({ id, on, onToggle, detected, saved }: { id: ProviderId; on: boolean; onToggle: () => void; detected: string[] | null; saved: boolean }) {
  const t = useT();
  const info = PROVIDERS[id];
  return (
    <button type="button" aria-pressed={on} onClick={onToggle}
      className={`${card} flex w-full flex-col items-start gap-1 p-4 text-left transition hover:bg-raised aria-pressed:border-accent-text aria-pressed:bg-accent-soft`}>
      <span className="flex w-full items-center gap-2">
        <span className="font-display text-sm font-semibold">{t(`conn.p.${id}.title`)}</span>
        {id === "claude-sub" && <StatusBadge tone="green" label={t("conn.recommended")} />}
        {saved && <StatusBadge tone="blue" label={t("conn.connected")} />}
        {info.kind === "local" && detected !== null && <StatusBadge tone="green" label={t("conn.found", { n: detected.length })} />}
      </span>
      <span className="text-xs text-mute">{t(`conn.p.${id}.hint`)}</span>
    </button>
  );
}

/** The first-run flow: pick → connect → default. `agents` and `connections` come fresh from the server after each save. */
export function ConnectWizard({ connections, detect, agents, accountName, startAt = "pick" }: { connections: Connection[]; detect: DetectReply | null; agents: TaskAgent[]; accountName: string; startAt?: "pick" | "default" }) {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<"pick" | "connect" | "default">(startAt);
  const found = (id: ProviderId) => detect?.local.find((l) => l.provider === id)?.models ?? null;
  const preselect = new Set<ProviderId>(connections.length === 0 && agents.length === 0 ? ["claude-sub", ...(["ollama", "lmstudio"] as const).filter((p) => found(p) !== null)] : []);
  const [picked, setPicked] = useState<Set<ProviderId>>(preselect);
  const [choice, setChoice] = useState<{ agent: string; model: string | null }>({ agent: agents[0]?.id ?? "", model: agents[0]?.defaultModel ?? null });
  const [err, setErr] = useState<string | null>(null);
  const savedIds = new Set(connections.map((c) => c.provider));
  const toggle = (id: ProviderId) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const finish = async (o: { skip: boolean }) => {
    const a = agents.find((x) => x.id === choice.agent);
    const r = await send("/api/preferences", "PUT", { defaultAgent: o.skip || !a ? null : a.id, defaultModel: o.skip || !a ? null : choice.model, onboarded: true });
    if (r.status === 200) router.push("/");
    else setErr(errorText(t, r, ERR));
  };
  const steps: { id: typeof step; label: Key }[] = [{ id: "pick", label: "welcome.step.pick" }, { id: "connect", label: "welcome.step.connect" }, { id: "default", label: "welcome.step.default" }];
  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-8 flex flex-wrap gap-2 text-xs" aria-label={t("welcome.steps")}>
        {steps.map((s, i) => <li key={s.id} aria-current={step === s.id ? "step" : undefined} className="rounded-full border border-line px-3 py-1 text-mute aria-[current=step]:border-accent-text aria-[current=step]:text-accent-text">{i + 1}. {t(s.label)}</li>)}
      </ol>
      {step === "pick" && (
        <section aria-labelledby="w-pick">
          <h2 id="w-pick" className="font-display text-xl font-semibold">{t("welcome.pick.title")}</h2>
          <p className="mt-1 text-sm text-mute">{t("welcome.pick.hint")}</p>
          {GROUPS.map((g) => (
            <div key={g.title} className="mt-6">
              <h3 className="mb-2 font-display text-xs font-medium uppercase tracking-[0.12em] text-mute">{t(g.title)}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.ids.map((id) => <ProviderCard key={id} id={id} on={picked.has(id)} onToggle={() => toggle(id)} detected={found(id)} saved={savedIds.has(id)} />)}
              </div>
            </div>
          ))}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className={btn.primary} disabled={picked.size === 0} onClick={() => setStep("connect")}>{t("welcome.continue")}</button>
            <button type="button" className={btn.ghost} onClick={() => void finish({ skip: true })}>{t("welcome.later")}</button>
          </div>
        </section>
      )}
      {step === "connect" && (
        <section aria-labelledby="w-connect" className="space-y-4">
          <h2 id="w-connect" className="font-display text-xl font-semibold">{t("welcome.connect.title")}</h2>
          <p className="text-sm text-mute">{t("welcome.connect.hint")}</p>
          {[...picked].map((id) => (
            <div key={id} className={`${card} p-5`}>
              <h3 className="font-display text-base font-semibold">{t(`conn.p.${id}.title`)}</h3>
              <p className="mt-1 mb-4 text-sm text-mute">{t(`conn.p.${id}.hint`)}</p>
              {id === "claude-sub" || id === "chatgpt-sub"
                ? <AccountLogin suggested={id === "chatgpt-sub" ? `${accountName}-chatgpt` : accountName} cli={id === "chatgpt-sub" ? "codex" : "claude"} onDone={() => router.refresh()} />
                : <KeyConnect provider={id} available={found(id) ?? []} onSaved={() => router.refresh()} />}
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btn.primary} onClick={() => { router.refresh(); setStep("default"); }}>{t("welcome.continue")}</button>
            <button type="button" className={btn.ghost} onClick={() => setStep("pick")}>{t("welcome.back")}</button>
          </div>
        </section>
      )}
      {step === "default" && (
        <section aria-labelledby="w-default" className="space-y-4">
          <h2 id="w-default" className="font-display text-xl font-semibold">{t("welcome.default.title")}</h2>
          <p className="text-sm text-mute">{t("welcome.default.hint")}</p>
          {agents.length === 0 ? <p className={`${card} p-5 text-sm text-mute`}>{t("welcome.default.none")}</p> : (
            <ul className={`${card} divide-y divide-line`}>
              {agents.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input type="radio" name="default-agent" checked={choice.agent === a.id} onChange={() => setChoice({ agent: a.id, model: a.defaultModel })} />
                    <span className="font-medium">{a.label}</span>
                    {a.local && <span className="text-xs text-mute">{t("conn.localNote")}</span>}
                  </label>
                  {a.models.length > 1 && (
                    <select className="rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-sm" aria-label={t("ws.model")} disabled={choice.agent !== a.id}
                      value={choice.agent === a.id ? (choice.model ?? "") : (a.defaultModel ?? "")} onChange={(e) => setChoice({ agent: a.id, model: e.target.value })}>
                      {a.models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {a.models.length === 1 && <span className="font-mono text-xs text-mute">{a.models[0]}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btn.primary} onClick={() => void finish({ skip: false })} disabled={agents.length > 0 && !choice.agent}>{t("welcome.finish")}</button>
            <button type="button" className={btn.ghost} onClick={() => setStep("connect")}>{t("welcome.back")}</button>
          </div>
          {err && <p className="text-sm text-bad" role="alert">{err}</p>}
        </section>
      )}
    </div>
  );
}

/** Settings → Models: every connection with its models (saved as the person changes them), removal, the default. */
export function ConnectionsManager({ connections, agents, preferred }: { connections: Connection[]; agents: TaskAgent[]; preferred: { agent: string | null; model: string | null } }) {
  const t = useT();
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { models: string[]; defaultModel: string }>>({});
  const [msg, setMsg] = useState<{ id: string; text: string; bad: boolean } | null>(null);
  const [def, setDef] = useState<{ agent: string; model: string | null }>({ agent: preferred.agent ?? agents[0]?.id ?? "", model: preferred.model ?? agents.find((a) => a.id === preferred.agent)?.defaultModel ?? null });
  const saveModels = async (c: Connection) => {
    const e = edits[c.id];
    if (!e) return;
    const r = await postJson(`/api/connections/${encodeURIComponent(c.id)}`, e, "PATCH");
    setMsg({ id: c.id, text: r.status === 200 ? t("conn.modelsSaved") : errorText(t, r, ERR), bad: r.status !== 200 });
    if (r.status === 200) router.refresh();
  };
  const remove = async (c: Connection) => {
    if (!window.confirm(t("conn.removeConfirm", { name: c.label }))) return;
    const r = await send(`/api/connections/${encodeURIComponent(c.id)}`, "DELETE");
    if (r.status === 200) router.refresh();
    else setMsg({ id: c.id, text: errorText(t, r, ERR), bad: true });
  };
  const saveDefault = async () => {
    const r = await send("/api/preferences", "PUT", { defaultAgent: def.agent || null, defaultModel: def.model, onboarded: true });
    setMsg({ id: "default", text: r.status === 200 ? t("conn.defaultSaved") : errorText(t, r, ERR), bad: r.status !== 200 });
    if (r.status === 200) router.refresh();
  };
  const sel = agents.find((a) => a.id === def.agent);
  return (
    <div className="space-y-6">
      <section aria-labelledby="m-default" className={`${card} p-5`}>
        <h2 id="m-default" className="font-display text-base font-semibold">{t("conn.defaultTitle")}</h2>
        <p className="mt-1 mb-3 text-sm text-mute">{t("conn.defaultHint")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <select className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm" aria-label={t("ws.agent")} value={def.agent} onChange={(e) => setDef({ agent: e.target.value, model: agents.find((a) => a.id === e.target.value)?.defaultModel ?? null })}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {sel && sel.models.length > 1 && (
            <select className="rounded-lg border border-line bg-canvas px-2 py-1.5 font-mono text-sm" aria-label={t("ws.model")} value={def.model ?? ""} onChange={(e) => setDef({ ...def, model: e.target.value })}>
              {sel.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <button type="button" className={btn.secondary} onClick={() => void saveDefault()} disabled={agents.length === 0}>{t("conn.saveDefault")}</button>
        </div>
        {msg?.id === "default" && <p className={`mt-2 text-sm ${msg.bad ? "text-bad" : "text-ok"}`} role="status">{msg.text}</p>}
      </section>
      {connections.length === 0 && <p className={`${card} p-5 text-sm text-mute`}>{t("conn.none")}</p>}
      {connections.map((c) => {
        const info = PROVIDERS[c.provider];
        const e = edits[c.id] ?? { models: c.models, defaultModel: c.defaultModel };
        const kind: Key = info.kind === "subscription" ? "conn.kind.subscription" : info.kind === "local" ? "conn.kind.local" : "conn.kind.key";
        return (
          <section key={c.id} aria-labelledby={`c-${c.id}`} className={`${card} space-y-4 p-5`}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={`c-${c.id}`} className="font-display text-base font-semibold">{c.label}</h2>
              <span className="text-xs text-mute">{info.label} · {t(kind)}</span>
              {info.auth !== "none" && info.kind !== "subscription" && <StatusBadge tone={c.hasKey ? "green" : "amber"} label={t(c.hasKey ? "conn.keySaved" : "conn.keyMissing")} />}
              {c.baseUrl && <span className="truncate font-mono text-xs text-mute">{c.baseUrl}</span>}
              {info.kind !== "subscription" && <button type="button" className={`${btn.ghost} ml-auto`} onClick={() => void remove(c)}>{t("conn.remove")}</button>}
            </div>
            <ModelPicker provider={c.provider} models={e.models} defaultModel={e.defaultModel} onChange={(models, defaultModel) => setEdits({ ...edits, [c.id]: { models, defaultModel } })} />
            <div className="flex items-center gap-3">
              <button type="button" className={btn.secondary} disabled={!edits[c.id]} onClick={() => void saveModels(c)}>{t("conn.saveModels")}</button>
              {msg?.id === c.id && <p className={`text-sm ${msg.bad ? "text-bad" : "text-ok"}`} role="status">{msg.text}</p>}
            </div>
          </section>
        );
      })}
      <Link href="/welcome?add=1" className={btn.primary}>{t("conn.addConnection")}</Link>
    </div>
  );
}
