// E9g A1 (D-371): the preload of the desktop window. It runs sandboxed (D-303), where `require` loads only "electron"
// and a few built-ins, so this file imports nothing: it is compiled on its own to CommonJS (tsconfig.preload.json →
// dist/preload.cjs). It exposes window.harnessDesktop with exactly the methods of the contract
// (packages/contract/src/desktop.ts; a test keeps the two lists equal). Here only shape and size are checked; the web
// parses every request and answer with zod, and main parses every request and its own answer again.

/** The same order as DESKTOP_METHOD_NAMES in packages/contract (test: preload.test.ts). */
export const PRELOAD_METHODS = ["pickFolder", "grantsList", "grant", "revoke", "openInEditor", "applyLocal", "notify", "badge", "inboxCount", "terminalOpen", "terminalWrite", "terminalResize", "terminalClose"] as const;
export type PreloadMethod = (typeof PRELOAD_METHODS)[number];
export const BRIDGE_KEY = "harnessDesktop";
const EVENT_CHANNEL = "harness:event";
/** DESKTOP_DROP_CHANNEL in packages/contract (test: preload.test.ts) */
const DROP_CHANNEL = "harness:drop";
const MAX_PAYLOAD = 64 * 1024;
const MAX_DEPTH = 16;

export interface IpcRendererLike {
  invoke(channel: string, payload: unknown): Promise<unknown>;
  on(channel: string, listener: (event: unknown, data: unknown) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, data: unknown) => void): unknown;
}

interface ElectronPreload {
  contextBridge: { exposeInMainWorld(key: string, api: unknown): void };
  ipcRenderer: IpcRendererLike & { send?: (channel: string, payload: unknown) => void };
  /** Electron's webUtils.getPathForFile: the local path of a dropped File (E9g A3) */
  webUtils?: { getPathForFile(file: unknown): string };
}

/** The part of a DragEvent the drop handling needs. */
export interface DropEventLike {
  defaultPrevented: boolean;
  dataTransfer: { types: ArrayLike<string>; files: ArrayLike<unknown> } | null;
  preventDefault(): void;
}

const hasFiles = (e: DropEventLike): boolean => e.dataTransfer !== null && Array.from(e.dataTransfer.types).includes("Files");

/** E9g A3 (AC-12.6): let files be dropped on the window, unless the page's own drop zone took the event. */
export function handleDragOver(e: DropEventLike): void {
  if (!e.defaultPrevented && hasFiles(e)) e.preventDefault();
}

/**
 * E9g A3 (AC-12.6): a folder dropped on the window (and not taken by the page) → its path to main, which shows the
 * "Add project" screen. The page never sees the path from here, and nothing is granted by a drop.
 */
export function handleDrop(e: DropEventLike, getPath: (file: unknown) => string, send: (channel: string, payload: unknown) => void): boolean {
  if (e.defaultPrevented || !hasFiles(e) || !e.dataTransfer || e.dataTransfer.files.length === 0) return false;
  e.preventDefault(); // otherwise Chromium would navigate to file:// (the guard refuses it anyway)
  let p: unknown;
  try {
    p = getPath(e.dataTransfer.files[0]);
  } catch {
    return false;
  }
  if (typeof p !== "string" || p === "") return false;
  send(DROP_CHANNEL, { path: p });
  return true;
}

export type HarnessDesktopApi = { readonly [M in PreloadMethod]: (payload: unknown) => Promise<unknown> } & {
  readonly version: 1;
  readonly onCommand: (callback: (command: unknown) => void) => () => void;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function plainJson(v: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) return false;
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => plainJson(x, depth + 1));
  return isPlainObject(v) && Object.values(v).every((x) => plainJson(x, depth + 1));
}

/** A request the preload passes on: a plain JSON object of at most 64 KiB. */
export function acceptablePayload(v: unknown): boolean {
  if (!isPlainObject(v) || !plainJson(v, 0)) return false;
  try {
    return JSON.stringify(v).length <= MAX_PAYLOAD;
  } catch {
    return false;
  }
}

const refused = (code: "invalid_request" | "failed", message: string) => ({ ok: false, error: { code, message } });

export function createHarnessDesktop(ipc: IpcRendererLike): HarnessDesktopApi {
  const api: Record<string, unknown> = { version: 1 };
  for (const m of PRELOAD_METHODS) {
    const channel = `harness:${m}`;
    api[m] = async (payload: unknown): Promise<unknown> => {
      if (!acceptablePayload(payload)) return refused("invalid_request", "the request must be a plain JSON object of at most 64 KiB");
      try {
        return await ipc.invoke(channel, payload);
      } catch {
        return refused("failed", "the desktop app did not answer");
      }
    };
  }
  api.onCommand = (callback: (command: unknown) => void): (() => void) => {
    if (typeof callback !== "function") throw new TypeError("onCommand needs a function");
    const listener = (_event: unknown, data: unknown): void => {
      if (isPlainObject(data)) callback(data); // the IPC event (sender, ports) never reaches the page
    };
    ipc.on(EVENT_CHANNEL, listener);
    return () => void ipc.removeListener(EVENT_CHANNEL, listener);
  };
  return Object.freeze(api) as HarnessDesktopApi;
}

export function installHarnessDesktop(electron: ElectronPreload): void {
  electron.contextBridge.exposeInMainWorld(BRIDGE_KEY, createHarnessDesktop(electron.ipcRenderer));
}

// In the window only: the sandboxed preload gets `require` from Electron's wrapper; in tests there is no window.
if ((globalThis as { window?: unknown }).window !== undefined && typeof require === "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- "electron" is the one module a sandboxed preload may load
  const electron = require("electron") as ElectronPreload;
  installHarnessDesktop(electron);
  const { webUtils, ipcRenderer } = electron;
  if (webUtils && typeof ipcRenderer.send === "function") {
    const send = ipcRenderer.send.bind(ipcRenderer);
    const w = (globalThis as unknown as { window: { addEventListener(type: string, l: (e: DropEventLike) => void): void } }).window;
    w.addEventListener("dragover", handleDragOver);
    w.addEventListener("drop", (e) => void handleDrop(e, (f) => webUtils.getPathForFile(f), send));
  }
}
