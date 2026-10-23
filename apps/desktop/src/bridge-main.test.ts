import { describe, expect, it, vi } from "vitest";
import { DESKTOP_EVENT_CHANNEL, DESKTOP_METHOD_NAMES, desktopChannel } from "@mandat/contract";
import { commandFor, dispatch, notReady, registerBridge, sendCommand } from "./bridge-main.js";
import type { DesktopHandlers, InvokeEvent } from "./bridge-main.js";

const BASE = "http://127.0.0.1:3000";
const local: InvokeEvent = { senderFrame: { url: `${BASE}/tasks/t_1` } };

function handlers(over: Partial<DesktopHandlers> = {}): DesktopHandlers {
  const nr = () => Promise.resolve(notReady());
  return {
    pickFolder: () => Promise.resolve({ ok: true, value: { path: "/Users/simo/code/shop" } }),
    grantsList: nr,
    grant: nr,
    revoke: nr,
    openInEditor: nr,
    applyLocal: nr,
    notify: () => Promise.resolve({ ok: true, value: {} }),
    badge: () => Promise.resolve({ ok: true, value: {} }),
    inboxCount: () => Promise.resolve({ ok: true, value: {} }),
    ...over,
  };
}

// E9g A1 (D-371): main answers only the listed channels, only to the local page, only with valid messages.
describe("desktop bridge, main side (D-371)", () => {
  it("a listed channel from the local page → the handler's value", async () => {
    expect(await dispatch(desktopChannel("pickFolder"), local, {}, handlers(), BASE)).toEqual({ ok: true, value: { path: "/Users/simo/code/shop" } });
    expect(await dispatch(desktopChannel("grantsList"), local, {}, handlers(), BASE)).toEqual({ ok: false, error: { code: "not_ready", message: expect.any(String) } });
  });

  it("an unknown channel is refused and no handler runs", async () => {
    const h = handlers({ pickFolder: vi.fn() });
    for (const ch of ["harness:exec", "harness:__proto__", "pickFolder", DESKTOP_EVENT_CHANNEL]) expect((await dispatch(ch, local, {}, h, BASE)).ok, ch).toBe(false);
    expect(await dispatch("harness:exec", local, {}, h, BASE)).toEqual({ ok: false, error: { code: "unknown_channel", message: expect.any(String) } });
    expect(h.pickFolder).not.toHaveBeenCalled();
  });

  it("a caller that is not the local page (another origin, no frame, no address yet) is denied", async () => {
    const h = handlers({ badge: vi.fn() });
    for (const ev of [{ senderFrame: { url: "https://evil.example/" } }, { senderFrame: { url: "http://127.0.0.1:3001/" } }, { senderFrame: null }, { senderFrame: { url: "data:text/html,x" } }])
      expect(await dispatch(desktopChannel("badge"), ev, { count: 1 }, h, BASE)).toEqual({ ok: false, error: { code: "denied", message: expect.any(String) } });
    expect(await dispatch(desktopChannel("badge"), local, { count: 1 }, h, null)).toMatchObject({ ok: false, error: { code: "denied" } });
    expect(h.badge).not.toHaveBeenCalled();
  });

  it("an invalid request never reaches the handler", async () => {
    const h = handlers({ badge: vi.fn() });
    expect(await dispatch(desktopChannel("badge"), local, { count: -5 }, h, BASE)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await dispatch(desktopChannel("badge"), local, { count: 1, extra: true }, h, BASE)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(h.badge).not.toHaveBeenCalled();
  });

  it("a handler that answers something malformed or throws → an error envelope, never the raw value", async () => {
    const bad = handlers({ pickFolder: () => Promise.resolve({ ok: true, value: { path: "relative/dir" } }) });
    expect(await dispatch(desktopChannel("pickFolder"), local, {}, bad, BASE)).toMatchObject({ ok: false, error: { code: "invalid_response" } });
    const boom = handlers({ notify: () => Promise.reject(new Error("no display at /Users/simo")) });
    expect(await dispatch(desktopChannel("notify"), local, { title: "x", body: "" }, boom, BASE)).toEqual({ ok: false, error: { code: "failed", message: "the desktop action failed" } });
  });

  it("registerBridge: exactly one handler per listed method, each on its own channel", async () => {
    const seen = new Map<string, (e: InvokeEvent, p: unknown) => Promise<unknown>>();
    registerBridge({ handle: (ch, fn) => void seen.set(ch, fn) }, handlers(), () => BASE);
    expect([...seen.keys()].sort()).toEqual(DESKTOP_METHOD_NAMES.map(desktopChannel).sort());
    expect(await seen.get(desktopChannel("badge"))?.(local, { count: 2 })).toEqual({ ok: true, value: {} });
  });

  it("commands to the UI are validated before they are sent", () => {
    const send = vi.fn();
    expect(sendCommand({ send }, { command: "open_task", task_id: "t_1" })).toBe(true);
    expect(send).toHaveBeenCalledWith(DESKTOP_EVENT_CHANNEL, { command: "open_task", task_id: "t_1" });
    expect(sendCommand({ send }, { command: "eval", code: "1" })).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(commandFor("t_9")).toEqual({ command: "open_task", task_id: "t_9" });
    expect(commandFor(undefined)).toEqual({ command: "view", view: "inbox" });
  });
});
