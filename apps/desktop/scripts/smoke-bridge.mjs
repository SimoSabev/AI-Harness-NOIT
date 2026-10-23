// E9g A1 (D-371): a smoke run of the bridge in real Electron (`pnpm --dir apps/desktop smoke`, after build + setup).
// A local page in a locked window with the real preload: the bridge is there with only the listed methods, main parses
// requests, the page has no require/process, window.open and outside navigation are refused, the CSP replaces the page's.
// Exit 0 when every check holds. Not part of `pnpm check` (needs the Electron binary and a display).
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, globalShortcut, ipcMain, safeStorage } from "electron";
import { registerBridge, registerDrop } from "../dist/bridge-main.js";
import { grantsFile } from "../dist/grant-store.js";
import { authorizeUse, localHandlers } from "../dist/local-handlers.js";
import { ptyEnv, shellArgs, shellFor, terminalSessions } from "../dist/terminal-sessions.js";
import { sendCommand } from "../dist/bridge-main.js";
import { allowPermission, attachGuards, withCsp } from "../dist/window-guard.js";
import { appMenu, toTemplate, trayMenu } from "../dist/menu.js";
import { QUICK_ENTRY } from "../dist/shortcuts.js";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failures.push(name);
};

async function run() {
  const srv = http.createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.setHeader("Content-Security-Policy", "default-src *");
    res.end("<!doctype html><title>smoke</title><script>window.inlineRan = true</script><body>smoke</body>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", () => r()));
  const address = srv.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const ok = (value) => Promise.resolve({ ok: true, value });
  // E9g A3: the real local-access handlers on a temp profile; the native box is answered "Allow" by the script
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-smoke-")));
  const project = path.join(tmp, "shop");
  mkdirSync(project);
  const home = path.join(tmp, "profile");
  const lh = localHandlers({
    lang: "en",
    env: { platform: process.platform, home: os.homedir(), mandatHome: home, realpath: (p) => realpathSync.native(p), isDirectory: (p) => { try { return statSync(p).isDirectory(); } catch { return false; } } },
    file: grantsFile(home),
    confirm: () => Promise.resolve(true),
    openExternal: () => Promise.resolve(),
    runNode: () => Promise.resolve({ code: 1, stdout: "" }),
    cliMain: "/nonexistent/main.js",
    now: () => new Date(),
  });
  // E9g A4 (D-375): the real host terminal (node-pty) behind the same grant check as main
  let win = null;
  const ts = terminalSessions({
    lang: "en",
    authorize: (p) => authorizeUse({ lang: "en", file: grantsFile(home), env: { platform: process.platform, home: os.homedir(), mandatHome: home, realpath: (q) => realpathSync.native(q), isDirectory: (q) => { try { return statSync(q).isDirectory(); } catch { return false; } } } }, p, "terminal"),
    loadPty: () => import("node-pty").then((m) => (o) => m.spawn(shellFor(process.env, process.platform), shellArgs(process.platform), { name: "xterm-256color", cols: o.cols, rows: o.rows, cwd: o.cwd, env: ptyEnv(process.env) }), () => null),
    send: (c) => win && sendCommand(win.webContents, c),
  });
  registerBridge(ipcMain, { pickFolder: () => ok({ path: null }), grantsList: lh.grantsList, grant: lh.grant, revoke: lh.revoke, openInEditor: lh.openInEditor, applyLocal: lh.applyLocal, notify: () => ok({}), badge: () => ok({}), inboxCount: () => ok({}), ...ts.handlers }, () => base);
  const dropped = [];
  registerDrop(ipcMain, () => base, (p) => dropped.push(p));
  win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(dist, "preload.cjs") } });
  attachGuards(win.webContents, () => base);
  let csp = null;
  win.webContents.session.webRequest.onHeadersReceived((d, cb) => {
    const h = withCsp(d.url, d.responseHeaders, base);
    if (d.url.startsWith(base)) csp = h["Content-Security-Policy"] ?? null;
    cb({ responseHeaders: h });
  });
  win.webContents.session.setPermissionRequestHandler((_w, p, cb, d) => cb(allowPermission(p, d.requestingUrl, base)));
  win.webContents.on("preload-error", (_e, _p, err) => check(`preload loads (${String(err)})`, false));
  await win.loadURL(`${base}/`);
  const r = await win.webContents.executeJavaScript(`(async () => {
    const b = window.harnessDesktop;
    return {
      keys: b ? Object.keys(b).sort().join(",") : "",
      require: typeof window.require, process: typeof window.process, inline: window.inlineRan === true,
      badge: await b.badge({ count: 2 }), grants: await b.grantsList({}), bad: await b.badge({ count: -1 }), notPlain: await b.badge("x"),
      termNo: await b.terminalOpen({ task_id: "t_1", path: ${JSON.stringify(project)}, cols: 80, rows: 24 }),
      grant: await b.grant({ path: ${JSON.stringify(project)}, scopes: ["read", "terminal"] }), root: await b.grant({ path: "/", scopes: ["read"] }),
      term: await (async () => {
        const got = { out: "", lines: [], exit: null };
        const off = b.onCommand((c) => { if (c.command === "terminal_output") got.out += c.data; if (c.command === "terminal_line") got.lines.push(c.line); if (c.command === "terminal_exit") got.exit = c.code; });
        const o = await b.terminalOpen({ task_id: "t_1", path: ${JSON.stringify(project)}, cols: 80, rows: 24 });
        if (!o.ok) return { open: o };
        await b.terminalWrite({ id: o.value.id, data: "echo SMOKE_$((40+2)); pwd\\r" });
        for (let i = 0; i < 100 && !got.out.includes("SMOKE_42"); i += 1) await new Promise((r) => setTimeout(r, 100));
        await b.terminalWrite({ id: o.value.id, data: "exit\\r" });
        for (let i = 0; i < 50 && got.exit === null; i += 1) await new Promise((r) => setTimeout(r, 100));
        off();
        return { open: o, ...got };
      })(),
      apply: await b.applyLocal({ task_id: "t_1", path: ${JSON.stringify(project)} }),
      drop: (() => { const dt = new DataTransfer(); dt.items.add(new File(["x"], "x.txt")); const e = new DragEvent("drop", { dataTransfer: dt, cancelable: true, bubbles: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })(),
      open: window.open("https://example.com/") === null,
    };
  })()`);
  check("bridge has exactly the listed methods", r.keys === "applyLocal,badge,grant,grantsList,inboxCount,notify,onCommand,openInEditor,pickFolder,revoke,terminalClose,terminalOpen,terminalResize,terminalWrite,version");
  check("no require/process in the page", r.require === "undefined" && r.process === "undefined");
  check("inline scripts run under the CSP", r.inline);
  check("a valid call answers", r.badge.ok === true);
  check("nothing is granted at first", r.grants.ok === true && r.grants.value.grants.length === 0);
  check("a project folder is granted (real path stored)", r.grant.ok === true && r.grant.value.grant.path === realpathSync.native(project));
  check('"/" is refused', r.root.ok === false && r.root.error.code === "denied");
  check("a host terminal without the terminal scope is refused", r.termNo.ok === false && r.termNo.error.code === "not_granted");
  check("the host terminal runs the shell in the granted folder (node-pty)", r.term.open?.ok === true && r.term.out.includes("SMOKE_42") && r.term.out.includes(realpathSync.native(project)));
  check("the typed lines come back for task_activities", JSON.stringify(r.term.lines) === JSON.stringify(["echo SMOKE_$((40+2)); pwd", "exit"]));
  check("the shell's exit is reported", r.term.exit === 0);
  check("apply without the apply scope is refused", r.apply.ok === false && r.apply.error.code === "not_granted");
  check("the preload's drop listener is installed (webUtils in the sandbox)", r.drop === true);
  check("a synthetic File (no local path) sends nothing", dropped.length === 0);
  check("main refuses an invalid request", r.bad.ok === false && r.bad.error.code === "invalid_request");
  check("the preload refuses a non-object", r.notPlain.ok === false && r.notPlain.error.code === "invalid_request");
  check("window.open is denied", r.open);
  check("the CSP replaced the page's", Array.isArray(csp) && csp.length === 1 && csp[0].startsWith("default-src 'self'"));
  await win.webContents.executeJavaScript(`location.href = "https://example.com/"; 1`).catch(() => 0);
  await new Promise((res) => setTimeout(res, 800));
  check("outside navigation is refused", win.webContents.getURL().startsWith(base));
  srv.close();
  rmSync(tmp, { recursive: true, force: true });
  // E9g A2: the menus build in real Electron (roles and accelerators accepted) and the quick entry registers
  const noop = () => undefined;
  let menusOk = true;
  for (const platform of ["darwin", "linux", "win32"]) {
    try {
      const m = Menu.buildFromTemplate(toTemplate(appMenu("en", platform, { appName: "Harness", loginItem: platform === "linux" ? null : false }), noop, noop));
      Menu.buildFromTemplate(toTemplate(trayMenu("bg", { waiting: 2, loginItem: false }), noop, noop));
      if (!m.items.length) menusOk = false;
    } catch (e) {
      console.error(e);
      menusOk = false;
    }
  }
  check("the menus build (3 platforms)", menusOk);
  const registered = globalShortcut.register(QUICK_ENTRY, noop);
  console.log(`info quick entry ${QUICK_ENTRY} registered: ${registered} (false only if another app holds it)`);
  check("the quick entry registers system-wide", registered);
  globalShortcut.unregisterAll();
  // E9g A4 (D-374): the async safeStorage API kek-keychain.ts uses exists in this Electron. No encrypt here: on an
  // unsigned build macOS may ask for the keychain, and nobody may be there to answer.
  // getSelectedStorageBackend exists only on Linux (on macOS 44.9.0 it is undefined at runtime though typed).
  const names = ["isAsyncEncryptionAvailable", "encryptStringAsync", "decryptStringAsync", ...(process.platform === "linux" ? ["getSelectedStorageBackend"] : [])];
  const api = names.every((n) => typeof safeStorage[n] === "function");
  check("safeStorage has the async API (KEK in the keychain)", api);
  if (process.platform === "linux") console.log(`info safeStorage backend: ${safeStorage.getSelectedStorageBackend()}`);
}

app.whenReady().then(run).then(
  () => app.exit(failures.length ? 1 : 0),
  (e) => {
    console.error(e);
    app.exit(1);
  },
);
