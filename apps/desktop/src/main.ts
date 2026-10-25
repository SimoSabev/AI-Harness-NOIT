import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, Tray, app, dialog, nativeImage } from "electron";
import { allowedUrl, childEnv, isErrorLine, localSpawn, loginScript, parseBanner, stopCommand, stepOf } from "./banner.js";
import type { Banner } from "./banner.js";
import { desktopLang, dt, loadingPage } from "./i18n.js";
import type { DesktopKey, Lang } from "./i18n.js";

// D-303: the desktop window of the harness (no name yet, D-296). It runs `pnpm local` (the same harness, the same sandbox), shows its steps,
// signs in with the password it printed (never written anywhere) and keeps the app in the tray. Built only locally.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const icon = nativeImage.createFromPath(path.join(repoRoot, "apps/web/public/icon-192.png"));
const SECURE = { contextIsolation: true, nodeIntegration: false, sandbox: true } as const;
// E7f: the language is chosen once the app is ready (app.getLocale() needs it): MANDAT_LANG, else the system locale.
let lang: Lang = "en";
const t = (key: DesktopKey, params?: Record<string, string | number>) => dt(lang, key, params);

let child: ChildProcess | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let banner: Banner | null = null;

function guard(w: BrowserWindow, base: string): void {
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e, url) => {
    if (!allowedUrl(url, base)) e.preventDefault();
  });
}

function show(): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${url}/login`, { signal: AbortSignal.timeout(2000) })).ok) return;
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
  guard(win, b.url);
  let signedIn = false;
  win.webContents.on("did-finish-load", () => {
    const w = win;
    if (signedIn || !w || !w.webContents.getURL().startsWith(`${b.url}/login`)) return;
    signedIn = true;
    void w.webContents.executeJavaScript(loginScript(b.email, b.password));
  });
  await win.loadURL(`${b.url}/login`);
  if (b.totp) {
    await dialog.showMessageBox(win, {
      type: "info",
      title: t("totp.title"),
      message: t("totp.message"),
      detail: `${b.totp.secret}\n\n${b.totp.uri}`,
      buttons: [t("totp.button")],
    });
  }
}

function stopChild(): void {
  const tree = stopCommand(child?.pid, process.platform);
  if (tree) spawn(tree.cmd, tree.args, { stdio: "ignore" }).on("error", () => child?.kill());
  else child?.kill("SIGINT");
}

function start(): void {
  lang = desktopLang(process.env, app.getLocale());
  win = new BrowserWindow({ width: 1200, height: 820, title: "", icon, webPreferences: SECURE });
  win.on("close", (e) => {
    if (child) {
      e.preventDefault();
      win?.hide(); // keeps running in the tray; "Stop and quit" stops it
    }
  });
  void win.loadURL(loadingPage(lang));
  let out = "";
  const local = localSpawn(process.env);
  child = spawn(local.cmd, local.args, { cwd: repoRoot, env: { ...childEnv(process.env), MANDAT_LANG: lang }, stdio: ["ignore", "pipe", "pipe"] });
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
    { label: t("tray.quit"), click: () => (child ? stopChild() : app.quit()) },
  ]));
  tray.on("click", show);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  app.on("activate", show);
  app.on("window-all-closed", () => undefined); // the tray keeps it alive
  app.on("before-quit", () => child && stopChild());
  void app.whenReady().then(start);
}
