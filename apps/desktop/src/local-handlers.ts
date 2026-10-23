import type { DesktopError, DesktopResult, LocalGrant, LocalScope } from "@mandat/contract";
import type { DesktopHandlers } from "./bridge-main.js";
import { loadGrants, saveGrants } from "./grant-store.js";
import { dt } from "./i18n.js";
import type { DesktopKey, Lang } from "./i18n.js";
import { addGrant, authorize, checkGrantable, removeGrant } from "./local-access.js";
import type { PathEnv } from "./local-access.js";
import { applyArgv, applyValue, editorUrl, isEditorUrl } from "./local-actions.js";

// E9g A3 (AC-12.6, D-373): the bridge methods for local access, without Electron (main.ts passes the dialog, the shell
// and the process runner in). Every grant: checks → a native confirmation that lists the scopes → the file. Every use:
// the real path must be inside a granted folder with the scope. A refusal says why, in the person's language.

export interface LocalDeps {
  lang: Lang;
  env: PathEnv;
  /** MANDAT_HOME/local-grants.json */
  file: string;
  /** the native "Allow / Cancel" box; true only on Allow */
  confirm: (title: string, detail: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  /** runs `node <argv>` without a shell; resolves with the exit code and stdout */
  runNode: (argv: string[]) => Promise<{ code: number; stdout: string }>;
  /** packages/cli/dist/main.js */
  cliMain: string;
  now: () => Date;
}

type LocalMethods = Pick<DesktopHandlers, "grantsList" | "grant" | "revoke" | "openInEditor" | "applyLocal">;

const SCOPE_KEY: Record<LocalScope, DesktopKey> = { read: "scope.read", apply: "scope.apply", open_editor: "scope.open_editor", terminal: "scope.terminal" };

export function confirmText(lang: Lang, p: string, scopes: readonly LocalScope[]): { title: string; detail: string } {
  return { title: dt(lang, "grant.title"), detail: dt(lang, "grant.detail", { path: p, scopes: scopes.map((s) => `• ${dt(lang, SCOPE_KEY[s])}`).join("\n") }) };
}

const no = (code: DesktopError["code"], lang: Lang, key: DesktopKey): DesktopResult<never> => ({ ok: false, error: { code, message: dt(lang, key) } });

export function localHandlers(d: LocalDeps): LocalMethods {
  const read = (): { grants: LocalGrant[]; broken: boolean } => loadGrants(d.file);
  const use = (p: string, scope: LocalScope): { ok: true; path: string } | { ok: false; res: DesktopResult<never> } => {
    const g = read();
    if (g.broken) return { ok: false, res: no("not_granted", d.lang, "refuse.broken") };
    const r = authorize(p, scope, g.grants, d.env);
    if (r.ok) return { ok: true, path: r.path };
    return { ok: false, res: no(r.reason === "missing" ? "failed" : "not_granted", d.lang, `refuse.${r.reason}`) };
  };
  return {
    grantsList: () => Promise.resolve({ ok: true, value: { grants: read().grants } }),
    grant: async (req) => {
      const c = checkGrantable(req.path, d.env);
      if (!c.ok) return no("denied", d.lang, `refuse.${c.reason}`);
      const t = confirmText(d.lang, c.path, req.scopes);
      if (!(await d.confirm(t.title, t.detail))) return no("cancelled", d.lang, "refuse.cancelled");
      const next = addGrant(read().grants, c.path, req.scopes, d.now()); // a broken file is replaced by this one
      saveGrants(d.file, next.grants);
      return { ok: true, value: { grant: next.grant } };
    },
    revoke: (req) => {
      const g = read();
      const left = removeGrant(g.grants, req.path, req.scopes);
      if (!g.broken) saveGrants(d.file, left);
      return Promise.resolve({ ok: true, value: { grants: left } });
    },
    openInEditor: async (req) => {
      const u = use(req.path, "open_editor");
      if (!u.ok) return u.res;
      const url = editorUrl(req.editor, u.path, req.line, d.env.platform);
      if (!isEditorUrl(url)) return no("failed", d.lang, "refuse.editor");
      try {
        await d.openExternal(url);
      } catch {
        return no("failed", d.lang, "refuse.editor");
      }
      return { ok: true, value: {} };
    },
    applyLocal: async (req) => {
      const u = use(req.path, "apply");
      if (!u.ok) return u.res;
      const r = await d.runNode(applyArgv(d.cliMain, req.task_id, u.path));
      return applyValue(r.code, r.stdout);
    },
  };
}
