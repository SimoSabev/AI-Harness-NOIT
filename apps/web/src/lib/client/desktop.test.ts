import { describe, expect, it, vi } from "vitest";
import { DESKTOP_METHOD_NAMES } from "@mandat/contract";
import { desktopBridge, isDesktop } from "./desktop";

function fakeBridge(answer: (method: string, payload: unknown) => unknown = () => ({ ok: true, value: {} })) {
  const calls: [string, unknown][] = [];
  const listeners: ((c: unknown) => void)[] = [];
  const b: Record<string, unknown> = { version: 1, onCommand: (cb: (c: unknown) => void) => (listeners.push(cb), () => listeners.splice(listeners.indexOf(cb), 1)) };
  for (const m of DESKTOP_METHOD_NAMES) b[m] = vi.fn((p: unknown) => (calls.push([m, p]), Promise.resolve(answer(m, p))));
  return { b, calls, emit: (c: unknown) => listeners.forEach((l) => l(c)), listeners };
}

// E9g A1 (D-371): the web finds the desktop bridge and talks to it only through the contract. Without the bridge
// (any browser, the PWA) nothing changes: no bridge object, no calls, no listeners.
describe("desktop bridge in the web (D-371)", () => {
  it("in a browser (no window.harnessDesktop) → null; the web stays exactly as today", () => {
    expect(desktopBridge(undefined)).toBeNull();
    expect(desktopBridge({})).toBeNull();
    expect(isDesktop({})).toBe(false);
    expect(desktopBridge({ document: {}, location: { href: "http://localhost:3000/" } })).toBeNull();
  });

  it("a half or foreign object under harnessDesktop is not a bridge", () => {
    const { b } = fakeBridge();
    expect(desktopBridge({ harnessDesktop: { ...b, version: 2 } })).toBeNull();
    expect(desktopBridge({ harnessDesktop: { ...b, badge: "x" } })).toBeNull();
    expect(desktopBridge({ harnessDesktop: { version: 1 } })).toBeNull();
    expect(desktopBridge({ harnessDesktop: null })).toBeNull();
    expect(isDesktop({ harnessDesktop: b })).toBe(true);
  });

  it("a valid request goes through and the answer is parsed", async () => {
    const { b, calls } = fakeBridge((m) => (m === "pickFolder" ? { ok: true, value: { path: "/Users/simo/code/shop" } } : { ok: true, value: {} }));
    const d = desktopBridge({ harnessDesktop: b });
    expect(await d?.call("pickFolder", {})).toEqual({ ok: true, value: { path: "/Users/simo/code/shop" } });
    expect(await d?.call("badge", { count: 4 })).toEqual({ ok: true, value: {} });
    expect(calls).toEqual([["pickFolder", {}], ["badge", { count: 4 }]]);
  });

  it("an invalid request is refused in the web; the bridge is never called", async () => {
    const { b, calls } = fakeBridge();
    const d = desktopBridge({ harnessDesktop: b });
    expect(await d?.call("badge", { count: -1 } as unknown as { count: number })).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await d?.call("exec" as "badge", { count: 1 })).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(calls).toEqual([]);
  });

  it("a malformed answer or a throwing bridge → an error, never a value", async () => {
    const bad = desktopBridge({ harnessDesktop: fakeBridge(() => ({ ok: true, value: { path: "../x" } })).b });
    expect(await bad?.call("pickFolder", {})).toMatchObject({ ok: false, error: { code: "invalid_response" } });
    const { b } = fakeBridge();
    b.notify = () => Promise.reject(new Error("gone"));
    expect(await desktopBridge({ harnessDesktop: b })?.call("notify", { title: "t", body: "" })).toMatchObject({ ok: false, error: { code: "failed" } });
  });

  it("commands from main: only valid ones reach the callback; unsubscribe works", () => {
    const { b, emit, listeners } = fakeBridge();
    const got: unknown[] = [];
    const off = desktopBridge({ harnessDesktop: b })?.onCommand((c) => got.push(c));
    emit({ command: "new_task" });
    emit({ command: "open_project", index: 42 });
    emit({ command: "eval", code: "alert(1)" });
    expect(got).toEqual([{ command: "new_task" }]);
    off?.();
    expect(listeners).toHaveLength(0);
  });
});
