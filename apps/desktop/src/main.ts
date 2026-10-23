import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, Notification, Tray, app, dialog, globalShortcut, ipcMain, nativeImage, safeStorage, shell } from "electron";
import { LocalPath } from "@mandat/contract";
import type { DesktopCommand } from "@mandat/contract";
import { childEnv, isErrorLine, parseBanner, stepOf } from "./banner.js";
import type { Banner } from "./banner.js";
import { commandFor, registerBridge, registerDrop, sendCommand } from "./bridge-main.js";
import type { DesktopHandlers } from "./bridge-main.js";
import { desktopLang, dt, loadingPage } from "./i18n.js";
import { grantsFile } from "./grant-store.js";
import { createInboxWatcher, notificationFor } from "./inbox-watch.js";
import { folderArgs } from "./local-access.js";
import { harnessEnv, resolveDesktopKek } from "./kek-keychain.js";
import { localHandlers } from "./local-handlers.js";
import { appMenu, toTemplate, trayMenu, trayState } from "./menu.js";
import type { MenuAction } from "./menu.js";
import { QUICK_ENTRY, shortcutsText } from "./shortcuts.js";
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
/** E9g A2: how many items wait for the person (the inbox), shown in the tray, the menubar and the badge. */
let waiting = 0;
/** E9g A2: "Start at login" exists on macOS and Windows only (Electron: app.setLoginItemSettings @platform darwin,win32). */
const loginSupported = process.platform === "darwin" || process.platform === "win32";
const INBOX_POLL_MS = 15_000;

/** D-303 + D-371: new windows denied, navigation only to the local address, a CSP, no web permissions but copy. */
function lockDown(w: BrowserWindow): void {
  attachGuards(w.webContents, () => base);
  const ses = w.webContents.session;
  ses.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: withCsp(details.url, details.responseHeaders, base) }));
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => callback(allowPermission(permission, details.requestingUrl, base)));
  ses.setPermissionCheckHandler((_wc, permission, origin) => allowPermission(permission, origin, base));
}

/** E9g A3 (D-373): the harness profile folder — the same MANDAT_HOME `pnpm local` uses (packages/cli/src/paths.ts). */
const mandatHome = path.resolve(process.env.MANDAT_HOME ?? path.join(repoRoot, ".mandat"));
const APPLY_TIMEOUT_MS = 120_000;

/** `node <argv>` without a shell and without API keys in its env (childEnv), with a time limit. */
function runNode(argv: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const c = spawn("node", argv, { cwd: repoRoot, env: childEnv(process.env), stdio: ["ignore", "pipe", "ignore"], shell: false });
    let out = "";
    const timer = setTimeout(() => c.kill("SIGTERM"), APPLY_TIMEOUT_MS);
    c.stdout.setEncoding("utf8").on("data", (d: string) => void (out = (out + d).slice(-200_000)));
    c.on("error", () => (clearTimeout(timer), resolve({ code: 127, stdout: "" })));
    c.on("close", (code) => (clearTimeout(timer), resolve({ code: code ?? 1, stdout: out })));
  });
}

/** E9g A3: grants (native confirm), revoke, open in editor, apply locally — the checks are in local-handlers.ts. */
function local(): ReturnType<typeof localHandlers> {
  return localHandlers({
    lang,
    env: {
      platform: process.platform,
      home: os.homedir(),
      mandatHome,
      realpath: (p) => realpathSync.native(p),
      isDirectory: (p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      },
    },
    file: grantsFile(mandatHome),
    confirm: async (title, detail) => {
      const opts = { type: "question" as const, message: title, detail, buttons: [t("grant.allow"), t("grant.cancel")], defaultId: 1, cancelId: 1, noLink: true };
      const r = win && !win.isDestroyed() ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
      return r.response === 0;
    },
    openExternal: (url) => shell.openExternal(url),
    runNode,
    cliMain: path.join(repoRoot, "packages/cli/dist/main.js"),
    now: () => new Date(),
  });
}

/** E9g A3 (AC-12.6): a dropped folder, "Open with" or a second start with a path → the "Add project" screen. Nothing is granted here. */
let pendingAdd: string | null = null;
function addProject(p: string): void {
  if (!LocalPath.safeParse(p).success) return;
  if (base && win && !win.isDestroyed()) toWeb({ command: "add_project", path: p });
  else pendingAdd = p;
}

const handlers: DesktopHandlers = {
  pickFolder: async () => {
    const opts = { title: t("dialog.pickFolder"), properties: ["openDirectory" as const] };
    const r = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return { ok: true, value: { path: r.canceled ? null : (r.filePaths[0] ?? null) } };
  },
  grantsList: (req) => local().grantsList(req),
  grant: (req) => local().grant(req),
  revoke: (req) => local().revoke(req),
  openInEditor: (req) => local().openInEditor(req),
  applyLocal: (req) => local().applyLocal(req),
  notify: (req) => {
    notifyNative(req.title, req.body, req.task_id);
    return Promise.resolve({ ok: true, value: {} });
  },
  badge: (req) => {
    app.setBadgeCount(req.count);
    return Promise.resolve({ ok: true, value: {} });
  },
  inboxCount: (req) => {
    setWaiting(req.count);
    return Promise.resolve({ ok: true, value: {} });
  },
};

/** A system notification; a click shows the window and opens the task card (else the inbox). */
function notifyNative(title: string, body: string, taskId: string | undefined): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon });
  n.on("click", () => toWeb(commandFor(taskId)));
  n.show();
}

/** E9g A2: a menu item, a shortcut or a notification click → the window comes up and the web gets the command. */
function toWeb(cmd: DesktopCommand): void {
  show();
  if (win && !win.isDestroyed() && base) sendCommand(win.webContents, cmd);
}

function loginItemOn(): boolean | null {
  return loginSupported ? app.getLoginItemSettings().openAtLogin : null;
}

function runAction(action: MenuAction): void {
  if (action === "open") show();
  else if (action === "quit") {
    if (child) child.kill("SIGINT");
    else app.quit();
  } else if (action === "toggle_login") {
    // off by default: only this click turns it on (or off again); the OS keeps the setting
    if (loginSupported) app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin });
    buildMenus();
  } else {
    const opts = { type: "info" as const, message: t("help.shortcuts"), detail: shortcutsText(lang, process.platform), buttons: [t("dialog.ok")] };
    void (win && !win.isDestroyed() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));
  }
}

function buildMenus(): void {
  const login = loginItemOn();
  Menu.setApplicationMenu(Menu.buildFromTemplate(toTemplate(appMenu(lang, process.platform, { appName: t("app.name"), loginItem: login }), toWeb, runAction)));
  tray?.setContextMenu(Menu.buildFromTemplate(toTemplate(trayMenu(lang, { waiting, loginItem: login }), toWeb, runAction)));
}

/** The counter everywhere at once: tray tooltip and menu, the macOS menubar title, the dock/taskbar badge. */
function setWaiting(count: number): void {
  const changed = count !== waiting;
  waiting = count;
  const s = trayState(lang, count, process.platform);
  tray?.setToolTip(s.tooltip);
  if (s.title !== null) tray?.setTitle(s.title);
  app.setBadgeCount(count); // macOS dock, Linux Unity launchers; Windows has none (the tray tooltip carries it, D-372)
  if (changed) buildMenus();
}

const watcher = createInboxWatcher({
  base: () => base,
  fetch: (url) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) }),
  onUpdate: (count, fresh) => {
    setWaiting(count);
    const n = notificationFor(lang, fresh, win !== null && !win.isDestroyed() && win.isVisible() && win.isFocused());
    if (n) notifyNative(n.title, n.body, n.task_id);
  },
});

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
  void watcher.tick();
  setInterval(() => void watcher.tick(), INBOX_POLL_MS).unref();
  for (const p of folderArgs(process.argv, process.platform, [app.getAppPath()])) addProject(p);
  if (pendingAdd) {
    const p = pendingAdd;
    pendingAdd = null;
    addProject(p);
  }
}

function start(kek: Buffer | null): void {
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
  child = spawn("pnpm", ["local"], { cwd: repoRoot, env: { ...harnessEnv(process.env, kek), MANDAT_LANG: lang }, stdio: ["ignore", "pipe", "pipe"] });
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
  tray.on("click", show);
  buildMenus();
  // E9g A2: the one system-wide shortcut — quick entry of a new task from anywhere. If another app holds it, the
  // menu items and the window shortcuts still work.
  globalShortcut.register(QUICK_ENTRY, () => toWeb({ command: "new_task" }));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_e, argv) => {
    show();
    for (const p of folderArgs(argv, process.platform, [app.getAppPath()])) addProject(p);
  });
  // macOS: a folder dropped on the dock icon or "Open with" (before ready too, so it is registered here)
  app.on("open-file", (e, p) => {
    e.preventDefault();
    addProject(p);
  });
  app.on("activate", show);
  app.on("window-all-closed", () => undefined); // the tray keeps it alive
  app.on("before-quit", () => child?.kill("SIGINT"));
  app.on("will-quit", () => globalShortcut.unregisterAll());
  void app.whenReady().then(async () => {
    registerBridge(ipcMain, handlers, () => base);
    registerDrop(ipcMain, () => base, addProject);
    // E9g A4 (D-374): the KEK of the key envelope from the OS keychain; without one, `pnpm local` keeps its 0600 file.
    const kek = await resolveDesktopKek({ keychain: safeStorage, platform: process.platform, mandatHome }).catch(() => null);
    start(kek?.source === "keychain" ? kek.kek : null);
  });
}
