import { DESKTOP_DROP_CHANNEL, DESKTOP_EVENT_CHANNEL, DESKTOP_METHOD_NAMES, DesktopCommand, DesktopDrop, desktopChannel, desktopMethodOf, parseDesktopRequest, parseDesktopResponse } from "@mandat/contract";
import type { DesktopErrorCode, DesktopMethod, DesktopRequest, DesktopResult, DesktopValue } from "@mandat/contract";
import { allowedUrl } from "./banner.js";

// E9g A1 (D-371): the main-process end of the bridge, pure (no Electron import) so it is tested as is. Every request:
// a listed channel → the caller is the local page → the request parses → the handler → its answer parses. Anything else
// becomes an error envelope; a handler's exception is never forwarded (it may hold paths or other details).

export type DesktopHandlers = { [M in DesktopMethod]: (req: DesktopRequest<M>) => Promise<DesktopResult<DesktopValue<M>>> };

/** The part of IpcMainInvokeEvent the check needs (Electron 44: senderFrame is WebFrameMain | null). */
export interface InvokeEvent {
  senderFrame: { url: string } | null;
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: InvokeEvent, payload: unknown) => Promise<unknown>): void;
}

export interface CommandTarget {
  send(channel: string, payload: unknown): void;
}

const fail = (code: DesktopErrorCode, message: string): DesktopResult<never> => ({ ok: false, error: { code, message } });

/** What the methods that a later step implements answer until then (grants, editor, apply: E9g A3). */
export function notReady(): DesktopResult<never> {
  return fail("not_ready", "not available in this version of the desktop app");
}

async function call<M extends DesktopMethod>(method: M, handlers: DesktopHandlers, payload: unknown): Promise<DesktopResult<unknown>> {
  const req = parseDesktopRequest(method, payload);
  if (!req.ok) return req;
  let out: unknown;
  try {
    out = await handlers[method](req.value);
  } catch {
    return fail("failed", "the desktop action failed");
  }
  return parseDesktopResponse(method, out);
}

export async function dispatch(channel: unknown, event: InvokeEvent, payload: unknown, handlers: DesktopHandlers, base: string | null): Promise<DesktopResult<unknown>> {
  const method = desktopMethodOf(channel);
  if (!method) return fail("unknown_channel", "unknown channel");
  const from = event.senderFrame?.url;
  if (!base || !from || !allowedUrl(from, base)) return fail("denied", "only the local harness page may call the desktop app");
  return call(method, handlers, payload);
}

/** One ipcMain.handle per listed method; channels not listed have no handler, so Electron rejects them. */
export function registerBridge(ipc: IpcMainLike, handlers: DesktopHandlers, base: () => string | null): void {
  for (const m of DESKTOP_METHOD_NAMES) {
    const channel = desktopChannel(m);
    ipc.handle(channel, (event, payload) => dispatch(channel, event, payload, handlers, base()));
  }
}

/** main → UI: only a valid command is sent. */
export function sendCommand(target: CommandTarget, cmd: unknown): boolean {
  const c = DesktopCommand.safeParse(cmd);
  if (!c.success) return false;
  target.send(DESKTOP_EVENT_CHANNEL, c.data);
  return true;
}

/** A click on a notification: its task card, else the inbox. */
export function commandFor(taskId: string | undefined): DesktopCommand {
  return taskId ? { command: "open_task", task_id: taskId } : { command: "view", view: "tasks" };
}

export interface IpcMainOnLike {
  on(channel: string, listener: (event: InvokeEvent, payload: unknown) => void): void;
}

/** E9g A3 (AC-12.6): the preload's drop channel. Only the local page, only an absolute path; onPath only shows "Add project". */
export function registerDrop(ipc: IpcMainOnLike, base: () => string | null, onPath: (path: string) => void): void {
  ipc.on(DESKTOP_DROP_CHANNEL, (event, payload) => {
    const b = base();
    const from = event.senderFrame?.url;
    if (!b || !from || !allowedUrl(from, b)) return;
    const d = DesktopDrop.safeParse(payload);
    if (d.success) onPath(d.data.path);
  });
}
