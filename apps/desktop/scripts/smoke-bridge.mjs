// E9g A1 (D-371): a smoke run of the bridge in real Electron (`pnpm --dir apps/desktop smoke`, after build + setup).
// A local page in a locked window with the real preload: the bridge is there with only the listed methods, main parses
// requests, the page has no require/process, window.open and outside navigation are refused, the CSP replaces the page's.
// Exit 0 when every check holds. Not part of `pnpm check` (needs the Electron binary and a display).
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, globalShortcut, ipcMain } from "electron";
import { notReady, registerBridge } from "../dist/bridge-main.js";
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
  const nr = () => Promise.resolve(notReady());
  registerBridge(ipcMain, { pickFolder: () => ok({ path: null }), grantsList: nr, grant: nr, revoke: nr, openInEditor: nr, applyLocal: nr, notify: () => ok({}), badge: () => ok({}), inboxCount: () => ok({}) }, () => base);
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(dist, "preload.cjs") } });
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
      open: window.open("https://example.com/") === null,
    };
  })()`);
  check("bridge has exactly the listed methods", r.keys === "applyLocal,badge,grant,grantsList,inboxCount,notify,onCommand,openInEditor,pickFolder,revoke,version");
  check("no require/process in the page", r.require === "undefined" && r.process === "undefined");
  check("inline scripts run under the CSP", r.inline);
  check("a valid call answers", r.badge.ok === true);
  check("A3 methods answer not_ready", r.grants.ok === false && r.grants.error.code === "not_ready");
  check("main refuses an invalid request", r.bad.ok === false && r.bad.error.code === "invalid_request");
  check("the preload refuses a non-object", r.notPlain.ok === false && r.notPlain.error.code === "invalid_request");
  check("window.open is denied", r.open);
  check("the CSP replaced the page's", Array.isArray(csp) && csp.length === 1 && csp[0].startsWith("default-src 'self'"));
  await win.webContents.executeJavaScript(`location.href = "https://example.com/"; 1`).catch(() => 0);
  await new Promise((res) => setTimeout(res, 800));
  check("outside navigation is refused", win.webContents.getURL().startsWith(base));
  srv.close();
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
}

app.whenReady().then(run).then(
  () => app.exit(failures.length ? 1 : 0),
  (e) => {
    console.error(e);
    app.exit(1);
  },
);
