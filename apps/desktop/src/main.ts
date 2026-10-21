import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, Tray, app, dialog, nativeImage } from "electron";
import { allowedUrl, childEnv, loginScript, parseBanner, stepOf } from "./banner.js";
import type { Banner } from "./banner.js";

// D-303: the desktop window of the harness (no name yet, D-296). It runs `pnpm local` (the same harness, the same sandbox), shows its steps,
// signs in with the password it printed (never written anywhere) and keeps the app in the tray. Built only locally.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const icon = nativeImage.createFromPath(path.join(repoRoot, "apps/web/public/icon-192.png"));
const SECURE = { contextIsolation: true, nodeIntegration: false, sandbox: true } as const;
const LOADING = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<!doctype html><meta charset="utf-8"><title>Харнес</title><body style="font:15px system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#fafafa;color:#18181b"><div><b>Харнесът се пуска…</b><p id="s" style="color:#52525b">проверка на компютъра</p></div>',
)}`;

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
      title: "Двуфакторен код",
      message: "Добави този ключ в приложение за кодове (Google Authenticator, 1Password…). Показва се само сега.",
      detail: `${b.totp.secret}\n\n${b.totp.uri}`,
      buttons: ["Добавих го"],
    });
  }
}

function start(): void {
  win = new BrowserWindow({ width: 1200, height: 820, title: "", icon, webPreferences: SECURE });
  win.on("close", (e) => {
    if (child) {
      e.preventDefault();
      win?.hide(); // keeps running in the tray; „Спри и излез“ stops it
    }
  });
  void win.loadURL(LOADING);
  let out = "";
  child = spawn("pnpm", ["local"], { cwd: repoRoot, env: childEnv(process.env), stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d: Buffer) => {
    if (banner) return;
    out += d.toString("utf8");
    banner = parseBanner(out);
    if (banner) {
      out = "";
      void open(banner).catch((e: unknown) => dialog.showErrorBox("Харнес", `Интерфейсът не тръгна: ${e instanceof Error ? e.message : String(e)}`));
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
    if (!banner) dialog.showErrorBox("Харнесът не тръгна", errTail.split("\n").filter((l) => /✗|грешка|не отговаря|не станаха|Error/i.test(l)).join("\n") || `pnpm local излезе с ${code ?? "?"}`);
    app.quit();
  });
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip("Харнес");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Отвори", click: show },
    { type: "separator" },
    { label: "Спри и излез", click: () => (child ? child.kill("SIGINT") : app.quit()) },
  ]));
  tray.on("click", show);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  app.on("activate", show);
  app.on("window-all-closed", () => undefined); // the tray keeps it alive
  app.on("before-quit", () => child?.kill("SIGINT"));
  void app.whenReady().then(start);
}
