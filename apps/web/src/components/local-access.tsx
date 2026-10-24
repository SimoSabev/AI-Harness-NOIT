"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DesktopResult, EditorKind, LocalActivityBody, LocalGrant, LocalScope } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { postJson } from "../lib/client/api";
import { desktopBridge } from "../lib/client/desktop";
import type { DesktopClient } from "../lib/client/desktop";
import { EDITOR_STORAGE_KEY, WORKING_COPY_STORAGE_KEY, activityFor, joinLocal, parseEditor, suggestProject } from "../lib/client/local-access";
import { HostTerminal } from "./host-terminal";
import { btn, card, input } from "./ui";
import { AddProjectForm } from "./add-project-form";

// E9g A3 (AC-12.6, D-373): the web half of local access. Everything here runs only in the desktop window (the bridge);
// in a browser or the PWA these components render nothing. Grants live in the desktop app's main process; main checks
// every path again and asks the person in a native dialog before any grant.

const SCOPES: readonly LocalScope[] = ["read", "apply", "open_editor", "terminal"];
const SCOPE_LABEL: Record<LocalScope, { label: Key; hint: Key }> = {
  read: { label: "local.scope.read", hint: "local.scope.readHint" },
  apply: { label: "local.scope.apply", hint: "local.scope.applyHint" },
  open_editor: { label: "local.scope.open_editor", hint: "local.scope.open_editorHint" },
  terminal: { label: "local.scope.terminal", hint: "local.scope.terminalHint" },
};
const EDITORS: readonly { id: EditorKind; name: string }[] = [
  { id: "vscode", name: "VS Code" },
  { id: "cursor", name: "Cursor" },
  { id: "zed", name: "Zed" },
];

/** The bridge, found after mount (the server render has none, so the first paint matches); undefined until then. */
function useDesktop(): DesktopClient | null | undefined {
  const [b, setB] = useState<DesktopClient | null | undefined>(undefined);
  useEffect(() => setB(desktopBridge()), []);
  return b;
}

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // a per-device convenience only
  }
}

function useMessage() {
  const t = useT();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fail = (r: DesktopResult<unknown>) => {
    if (!r.ok) setMsg({ ok: false, text: t("local.error", { message: r.error.message }) });
  };
  const node = msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>;
  return { setMsg, fail, node };
}

/** Settings: a link to the Local access page, only in the desktop app. */
export function LocalAccessLink() {
  const t = useT();
  const b = useDesktop();
  if (!b) return null;
  return (
    <section aria-labelledby="s-local" className={`${card} mt-4 p-5`}>
      <h2 id="s-local" className="font-display text-base font-semibold">{t("local.title")}</h2>
      <p className="mt-1 mb-3 text-sm text-mute">{t("local.settingsHint")}</p>
      <Link href="/settings/local" className="text-sm text-accent underline-offset-4 hover:underline">{t("local.settingsLink")}</Link>
    </section>
  );
}

/** Settings → Local access: the granted folders, revoke a scope or the folder, the editor choice. */
export function LocalAccessPanel() {
  const t = useT();
  const b = useDesktop();
  const [grants, setGrants] = useState<LocalGrant[]>([]);
  const [editor, setEditor] = useState<EditorKind>("vscode");
  const m = useMessage();
  useEffect(() => {
    setEditor(parseEditor(readStore(EDITOR_STORAGE_KEY)));
    if (b) void b.call("grantsList", {}).then((r) => (r.ok ? setGrants(r.value.grants) : m.fail(r)));
  }, [b]); // m.fail only sets a message
  if (b === undefined) return null;
  if (!b) return <p className={`${card} mt-6 p-5 text-sm text-mute`}>{t("local.desktopOnly")}</p>;
  const revoke = async (path: string, scopes?: LocalScope[]) => {
    const r = await b.call("revoke", scopes ? { path, scopes } : { path });
    if (r.ok) setGrants(r.value.grants);
    else m.fail(r);
  };
  return (
    <>
      <section aria-labelledby="l-grants" className={`${card} mt-6 p-5`}>
        <h2 id="l-grants" className="font-display text-base font-semibold">{t("local.title")}</h2>
        {grants.length === 0 ? (
          <p className="mt-2 text-sm text-mute">{t("local.none")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {grants.map((g) => (
              <li key={g.path} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm break-all">{g.path}</span>
                  <button type="button" className={btn.danger} aria-label={t("local.revokeFolderLabel", { path: g.path })} onClick={() => void revoke(g.path)}>{t("local.revokeFolder")}</button>
                </div>
                <p className="mt-1 text-xs text-mute">{t("local.grantedAt", { at: g.granted_at.slice(0, 16).replace("T", " ") })}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {g.scopes.map((s) => (
                    <li key={s}>
                      <button type="button" className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1 text-xs hover:bg-raised" aria-label={t("local.revokeScope", { scope: t(SCOPE_LABEL[s].label), path: g.path })} onClick={() => void revoke(g.path, [s])}>
                        {t(SCOPE_LABEL[s].label)} <span aria-hidden="true">×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {m.node}
      </section>
      <section aria-labelledby="l-editor" className={`${card} mt-4 p-5`}>
        <h2 id="l-editor" className="font-display text-base font-semibold">{t("local.editor")}</h2>
        <p className="mt-1 mb-4 text-sm text-mute">{t("local.editorHint")}</p>
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">{t("local.editor")}</legend>
          {EDITORS.map((e) => (
            <label key={e.id} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 transition hover:bg-raised has-[:checked]:border-accent-text has-[:checked]:bg-accent-soft">
              <input type="radio" name="editor" value={e.id} checked={editor === e.id} onChange={() => (setEditor(e.id), writeStore(EDITOR_STORAGE_KEY, e.id))} className="mt-1 accent-[var(--accent)]" />
              <span className="text-sm font-medium">{e.name}</span>
            </label>
          ))}
        </fieldset>
      </section>
    </>
  );
}

/** "Add project" (AC-12.6): a folder from the drop / "Open with" / the dialog, the suggestion, the rights, then grant. */
export function AddProject({ initialPath }: { initialPath: string | null }) {
  const t = useT();
  const b = useDesktop();
  const [path, setPath] = useState<string | null>(initialPath);
  const [scopes, setScopes] = useState<LocalScope[]>(initialPath ? suggestProject(initialPath).scopes : ["read"]);
  const [granted, setGranted] = useState<string | null>(null);
  const m = useMessage();
  useEffect(() => {
    setPath(initialPath);
    setGranted(null);
  }, [initialPath]);
  if (b === undefined) return null;
  // D-388: in a browser the folder is typed; the desktop picks it, grants the rights, then adds it the same way
  if (!b) return <AddProjectForm />;
  const pick = async () => {
    const r = await b.call("pickFolder", {});
    if (r.ok && r.value.path) {
      setPath(r.value.path);
      setScopes(suggestProject(r.value.path).scopes);
      setGranted(null);
    } else m.fail(r);
  };
  const grant = async () => {
    if (!path || scopes.length === 0) return;
    m.setMsg(null);
    const r = await b.call("grant", { path, scopes });
    if (r.ok) setGranted(r.value.grant.path);
    else m.fail(r);
  };
  const toggle = (s: LocalScope) => setScopes((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : SCOPES.filter((x) => x === s || xs.includes(x))));
  const suggestion = path ? suggestProject(path) : null;
  return (
    <section aria-labelledby="add-h" className={`${card} mt-6 p-5`}>
      <h2 id="add-h" className="sr-only">{t("add.title")}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-sm font-medium">{t("add.folder")}</span>
          <input className={`${input} mt-1 font-mono`} value={path ?? ""} readOnly aria-readonly="true" />
        </label>
        <button type="button" className={btn.secondary} onClick={() => void pick()}>{t("add.pick")}</button>
      </div>
      <p className="mt-2 text-xs text-mute">{t("add.dropHint")}</p>
      {suggestion && (
        <>
          <p className="mt-4 text-sm">
            <span className="text-mute">{t("add.suggestedName")}: </span>
            <span className="font-mono">{suggestion.name}</span>
          </p>
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">{t("add.scopes")}</legend>
            {SCOPES.map((s) => (
              <label key={s} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 transition hover:bg-raised has-[:checked]:border-accent-text has-[:checked]:bg-accent-soft">
                <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} className="mt-1 accent-[var(--accent)]" />
                <span><span className="block text-sm font-medium">{t(SCOPE_LABEL[s].label)}</span><span className="mt-0.5 block text-xs text-mute">{t(SCOPE_LABEL[s].hint)}</span></span>
              </label>
            ))}
          </fieldset>
          <button type="button" className={`${btn.primary} mt-4`} disabled={scopes.length === 0} onClick={() => void grant()}>{t("add.grant")}</button>
        </>
      )}
      {granted && (
        <div className="mt-4 text-sm">
          <p role="status" className="text-ok">{t("add.granted", { path: granted })}</p>
          <AddProjectForm path={granted} />
        </div>
      )}
      {m.node}
    </section>
  );
}

/** The task's diff: "Apply locally" (data-desktop-apply, the File menu presses it) and "Open in editor" per file. */
export function LocalActions({ taskId, repoId, files }: { taskId: string; repoId: string; files: string[] }) {
  const t = useT();
  const b = useDesktop();
  const [grants, setGrants] = useState<LocalGrant[]>([]);
  const [folder, setFolder] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState(false);
  const m = useMessage();
  const storeKey = `${WORKING_COPY_STORAGE_KEY}.${repoId}`;
  useEffect(() => {
    if (!b) return;
    void b.call("grantsList", {}).then((r) => {
      if (!r.ok) return;
      const usable = r.value.grants.filter((g) => g.scopes.includes("apply") || g.scopes.includes("open_editor") || g.scopes.includes("terminal"));
      setGrants(usable);
      const saved = readStore(storeKey);
      setFolder(usable.find((g) => g.path === saved)?.path ?? usable[0]?.path ?? "");
    });
  }, [b, storeKey]);
  if (!b) return null;
  const record = (a: LocalActivityBody | null) => {
    if (a) void postJson(`/api/tasks/${taskId}/local-activity`, a);
  };
  const grant = grants.find((g) => g.path === folder);
  const apply = async () => {
    setBusy(true);
    m.setMsg(null);
    const r = await b.call("applyLocal", { task_id: taskId, path: folder });
    setBusy(false);
    record(activityFor("local_apply", r));
    if (!r.ok) return m.fail(r);
    const v = r.value;
    const head = v.head?.slice(0, 12) ?? "";
    m.setMsg(v.status === "refused" ? { ok: false, text: t("localActions.refused", { detail: v.detail ?? "" }) } : { ok: true, text: t(v.status === "applied" ? "localActions.applied" : "localActions.upToDate", { head }) });
  };
  const open = async (file: string) => {
    const p = joinLocal(folder, file);
    if (!p) return;
    const r = await b.call("openInEditor", { path: p, editor: parseEditor(readStore(EDITOR_STORAGE_KEY)) });
    record(activityFor("local_editor", r, file));
    if (!r.ok) m.fail(r);
  };
  return (
    <section aria-labelledby="local-h" className={`${card} mt-4 p-4`}>
      <h3 id="local-h" className="font-display text-sm font-semibold">{t("localActions.title")}</h3>
      {grants.length === 0 ? (
        <p className="mt-2 text-sm text-mute">
          {t("localActions.noFolder")} <Link href="/settings/local" className="text-accent underline underline-offset-4">{t("local.title")}</Link>
        </p>
      ) : (
        <>
          <label className="mt-3 block">
            <span className="text-sm font-medium">{t("localActions.copy")}</span>
            <select className={`${input} mt-1 font-mono`} value={folder} aria-label={t("localActions.choose")} onChange={(e) => (setFolder(e.target.value), setTerm(false), writeStore(storeKey, e.target.value))}>
              {grants.map((g) => <option key={g.path} value={g.path}>{g.path}</option>)}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" data-desktop-apply="" className={btn.secondary} disabled={busy || !grant?.scopes.includes("apply")} onClick={() => void apply()}>{t("localActions.apply")}</button>
            {grant?.scopes.includes("terminal") && !term && (
              <button type="button" className={btn.secondary} onClick={() => setTerm(true)}>{t("localActions.terminal")}</button>
            )}
          </div>
          {term && grant?.scopes.includes("terminal") && <HostTerminal bridge={b} taskId={taskId} folder={folder} onClose={() => setTerm(false)} />}
          {grant?.scopes.includes("open_editor") && files.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-mute hover:text-ink">{t("localActions.files")}</summary>
              <ul className="mt-2 space-y-1">
                {files.map((f) => (
                  <li key={f}>
                    <button type="button" className="text-left font-mono text-xs text-accent underline-offset-4 hover:underline" aria-label={t("localActions.openFile", { file: f })} onClick={() => void open(f)}>{f}</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {m.node}
    </section>
  );
}
