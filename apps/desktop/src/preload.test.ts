import { describe, expect, it, vi } from "vitest";
import { DESKTOP_EVENT_CHANNEL, DESKTOP_METHOD_NAMES, desktopChannel } from "@mandat/contract";
import { BRIDGE_KEY, PRELOAD_METHODS, createHarnessDesktop, installHarnessDesktop } from "./preload.js";
import type { IpcRendererLike } from "./preload.js";

function fakeIpc() {
  const listeners = new Map<string, (event: unknown, data: unknown) => void>();
  const ipc: IpcRendererLike & { invoke: ReturnType<typeof vi.fn> } = {
    invoke: vi.fn((channel: string) => Promise.resolve({ ok: true, value: { channel } })),
    on: (ch, l) => void listeners.set(ch, l),
    removeListener: (ch) => void listeners.delete(ch),
  };
  return { ipc, emit: (ch: string, data: unknown) => listeners.get(ch)?.({ sender: "the IPC event must not leak" }, data), has: (ch: string) => listeners.has(ch) };
}

// E9g A1 (D-371): the preload exposes window.harnessDesktop with only the listed methods; it cannot import zod
// (a sandboxed preload may require only "electron"), so it checks shape and size, and both ends parse with the contract.
describe("desktop preload (D-371)", () => {
  it("the preload's method list is the contract's list, in the same order", () => {
    expect([...PRELOAD_METHODS]).toEqual(DESKTOP_METHOD_NAMES);
    expect(BRIDGE_KEY).toBe("harnessDesktop");
  });

  it("exactly the listed methods + onCommand + version; frozen; each method invokes its own channel", async () => {
    const { ipc } = fakeIpc();
    const api = createHarnessDesktop(ipc);
    expect(Object.keys(api).sort()).toEqual([...DESKTOP_METHOD_NAMES, "onCommand", "version"].sort());
    expect(Object.isFrozen(api)).toBe(true);
    expect(api.version).toBe(1);
    for (const m of DESKTOP_METHOD_NAMES) {
      await api[m]({});
      expect(ipc.invoke).toHaveBeenLastCalledWith(desktopChannel(m), {});
    }
    expect((api as unknown as Record<string, unknown>).invoke).toBeUndefined();
    expect((api as unknown as Record<string, unknown>).send).toBeUndefined();
  });

  it("a payload that is not a plain JSON object, or too big, never reaches IPC", async () => {
    const { ipc } = fakeIpc();
    const api = createHarnessDesktop(ipc);
    class Thing {}
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const bad of [null, "x", 1, [], new Thing(), { f: () => 1 }, cyclic, { big: "a".repeat(70_000) }, new Map()]) {
      expect(await api.badge(bad)).toEqual({ ok: false, error: { code: "invalid_request", message: expect.any(String) } });
    }
    expect(ipc.invoke).not.toHaveBeenCalled();
  });

  it("an IPC failure becomes an error envelope, not an exception", async () => {
    const { ipc } = fakeIpc();
    ipc.invoke.mockRejectedValueOnce(new Error("No handler registered for 'harness:badge'"));
    expect(await createHarnessDesktop(ipc).badge({ count: 1 })).toEqual({ ok: false, error: { code: "failed", message: expect.any(String) } });
  });

  it("onCommand passes only the data (never the IPC event), only plain objects; unsubscribe removes the listener", () => {
    const { ipc, emit, has } = fakeIpc();
    const api = createHarnessDesktop(ipc);
    const got: unknown[] = [];
    const off = api.onCommand((c) => got.push(c));
    emit(DESKTOP_EVENT_CHANNEL, { command: "new_task" });
    emit(DESKTOP_EVENT_CHANNEL, "not an object");
    expect(got).toEqual([{ command: "new_task" }]);
    off();
    expect(has(DESKTOP_EVENT_CHANNEL)).toBe(false);
    expect(() => api.onCommand("nope" as unknown as (c: unknown) => void)).toThrow();
  });

  it("install exposes the frozen API under harnessDesktop through contextBridge only", () => {
    const { ipc } = fakeIpc();
    const expose = vi.fn();
    installHarnessDesktop({ contextBridge: { exposeInMainWorld: expose }, ipcRenderer: ipc });
    expect(expose).toHaveBeenCalledTimes(1);
    expect(expose.mock.calls[0]?.[0]).toBe("harnessDesktop");
    expect(Object.isFrozen(expose.mock.calls[0]?.[1])).toBe(true);
  });
});
