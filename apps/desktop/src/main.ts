import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, nativeImage } from "electron";
import { childEnv, isErrorLine, parseBanner, stepOf } from "./banner.js";
import type { Banner } from "./banner.js";
import { commandFor, notReady, registerBridge, sendCommand } from "./bridge-main.js";
import type { DesktopHandlers } from "./bridge-main.js";
import { desktopLang, dt, loadingPage } from "./i18n.js";
import type { DesktopKey, Lang } from "./i18n.js";
import { allowPermission, attachGuards, withCsp } from "./window-guard.js";

// D-303: the desktop window of the harness (no name yet, D-296). It runs `pnpm local` (the same harness, the same sandbox), shows its steps,
// opens the address it printed (no login, D-368) and keeps the app in the tray. Built only locally.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const icon = nativeImage.createFromPath(path.join(repoRoot, "apps/web/public/icon-192.png"));
// D-371: the preload (dist/preload.cjs, compiled on its own) is the only way from the page to main.
const SECURE = { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, preload: path.join(here, "preload.cjs") } as const;
// E7f: the language is chosen once the app is ready (app.getLocale() needs it): MANDAT_LANG, else the system locale.
let lang: Lang = "en";
const t = (key: DesktopKey, params?: Record<string, string | number>) => dt(lang, key, params);

let child: ChildProcess | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let banner: Banner | null = null;
/** The local address of `pnpm local` once its banner came; the guards, the CSP and the bridge allow only it. */
let base: string | null = null;

/** D-303 + D-371: new windows denied, navigation only to the local address, a CSP, no web permissions but copy. */
function lockDown(w: BrowserWindow): void {
  attachGuards(w.webContents, () => base);
  const ses = w.webContents.session;
  ses.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: withCsp(details.url, details.responseHeaders, base) }));
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => callback(allowPermission(permission, details.requestingUrl, base)));
  ses.setPermissionCheckHandler((_wc, permission, origin) => allowPermission(permission, origin, base));
}

/** E9g A1: what the bridge does today; grants, the editor and apply come with A3 (until then: not_ready). */
const handlers: DesktopHandlers = {
  pickFolder: async () => {
    const opts = { title: t("dialog.pickFolder"), properties: ["openDirectory" as const] };
    const r = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return { ok: true, value: { path: r.canceled ? null : (r.filePaths[0] ?? null) } };
  },
  grantsList: () => Promise.resolve(notReady()),
  grant: () => Promise.resolve(notReady()),
  revoke: () => Promise.resolve(notReady()),
  openInEditor: () => Promise.resolve(notReady()),
  applyLocal: () => Promise.resolve(notReady()),
  notify: (req) => {
    const n = new Notification({ title: req.title, body: req.body, icon });
    n.on("click", () => {
      show();
      if (win && !win.isDestroyed()) sendCommand(win.webContents, commandFor(req.task_id));
    });
    n.show();
    return Promise.resolve({ ok: true, value: {} });
  },
  badge: (req) => {
    app.setBadgeCount(req.count);
    return Promise.resolve({ ok: true, value: {} });
  },
  inboxCount: (req) => {
    tray?.setToolTip(req.count > 0 ? `${t("app.name")} — ${t("tray.waiting", { count: req.count })}` : t("app.name"));
    if (process.platform === "darwin") tray?.setTitle(req.count > 0 ? String(req.count) : "");
    return Promise.resolve({ ok: true, value: {} });
  },
};

function show(): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      // D-368: /login of `pnpm local` redirects to the start page; any answer below 500 means it is up
      const r = await fetch(`${url}/login`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
      if (r.status > 0 && r.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("web did not start");
}

async function open(b: Banner): Promise<void> {
  await waitFor(b.url);
  if (!win || win.isDestroyed()) return;
  base = b.url;
  await win.loadURL(`${b.url}/`); // D-368: no login — the local owner, this computer only
}

function start(): void {
  lang = desktopLang(process.env, app.getLocale());
  win = new BrowserWindow({ width: 1200, height: 820, title: "", icon, webPreferences: SECURE });
  lockDown(win);
  win.on("close", (e) => {
    if (child) {
      e.preventDefault();
      win?.hide(); // keeps running in the tray; "Stop and quit" stops it
    }
  });
  void win.loadURL(loadingPage(lang));
  let out = "";
  child = spawn("pnpm", ["local"], { cwd: repoRoot, env: { ...childEnv(process.env), MANDAT_LANG: lang }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d: Buffer) => {
    if (banner) return;
    out += d.toString("utf8");
    banner = parseBanner(out);
    if (banner) {
      out = "";
      void open(banner).catch((e: unknown) => dialog.showErrorBox(t("app.name"), t("error.ui", { error: e instanceof Error ? e.message : String(e) })));
    }
  });
  let errTail = "";
  child.stderr?.on("data", (d: Buffer) => {
    const text = d.toString("utf8");
    errTail = (errTail + text).slice(-2000);
    for (const line of text.split("\n")) {
      const s = stepOf(line);
      if (s && win && !banner) void win.webContents.executeJavaScript(`document.getElementById("s").textContent = ${JSON.stringify(`${s.n}/${s.of} ${s.text}`)}`);
    }
  });
  child.on("exit", (code) => {
    child = null;
    if (!banner) dialog.showErrorBox(t("error.start"), errTail.split("\n").filter(isErrorLine).join("\n") || t("error.exit", { code: code ?? "?" }));
    app.quit();
  });
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip(t("app.name"));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t("tray.open"), click: show },
    { type: "separator" },
    { label: t("tray.quit"), click: () => (child ? child.kill("SIGINT") : app.quit()) },
  ]));
  tray.on("click", show);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  app.on("activate", show);
  app.on("window-all-closed", () => undefined); // the tray keeps it alive
  app.on("before-quit", () => child?.kill("SIGINT"));
  void app.whenReady().then(() => {
    registerBridge(ipcMain, handlers, () => base);
    start();
  });
}
