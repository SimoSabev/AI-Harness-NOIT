import { describe, expect, it } from "vitest";
import { DESKTOP_CSP, allowPermission, attachGuards, withCsp } from "./window-guard.js";
import type { GuardEvent } from "./window-guard.js";

const BASE = "http://127.0.0.1:3000";

/** A stand-in for webContents: records the handlers the guard attaches. */
function fakeContents() {
  const listeners = new Map<string, (e: GuardEvent) => void>();
  let openHandler: ((d: { url: string }) => { action: "deny" }) | null = null;
  return {
    target: {
      setWindowOpenHandler: (h: (d: { url: string }) => { action: "deny" }) => void (openHandler = h),
      on: (event: string, l: (e: GuardEvent) => void) => void listeners.set(event, l),
    },
    fire(event: string, url: string): boolean {
      let prevented = false;
      listeners.get(event)?.({ url, preventDefault: () => void (prevented = true) });
      return prevented;
    },
    open: (url: string) => openHandler?.({ url }),
    events: () => [...listeners.keys()].sort(),
  };
}

// E9g A1 (D-303, D-371): the window stays locked; the bridge adds a CSP on top.
describe("desktop window guard (D-303, D-371)", () => {
  it("new windows are always denied, also for the local address", () => {
    const c = fakeContents();
    attachGuards(c.target, () => BASE);
    expect(c.open("https://evil.example/")).toEqual({ action: "deny" });
    expect(c.open(`${BASE}/tasks/t_1`)).toEqual({ action: "deny" });
  });

  it("navigation and redirects leave the local address → refused; inside → allowed; no address yet → everything refused", () => {
    const c = fakeContents();
    let base: string | null = null;
    attachGuards(c.target, () => base);
    expect(c.events()).toEqual(["will-attach-webview", "will-frame-navigate", "will-navigate", "will-redirect"]);
    expect(c.fire("will-navigate", `${BASE}/`)).toBe(true); // before the banner: nothing is local yet
    base = BASE;
    for (const ev of ["will-navigate", "will-frame-navigate", "will-redirect"]) {
      expect(c.fire(ev, `${BASE}/board`), ev).toBe(false);
      expect(c.fire(ev, "https://evil.example/"), ev).toBe(true);
      expect(c.fire(ev, "http://127.0.0.1:3001/"), ev).toBe(true);
      expect(c.fire(ev, "file:///etc/passwd"), ev).toBe(true);
      expect(c.fire(ev, "javascript:alert(1)"), ev).toBe(true);
    }
    expect(c.fire("will-attach-webview", `${BASE}/`)).toBe(true); // no <webview> ever
  });

  it("the CSP goes on local responses only and replaces any CSP the page sent", () => {
    const h = withCsp(`${BASE}/`, { "content-type": ["text/html"], "Content-Security-Policy": ["default-src *"] }, BASE);
    expect(h["Content-Security-Policy"]).toEqual([DESKTOP_CSP]);
    expect(h["content-type"]).toEqual(["text/html"]);
    expect(Object.keys(h).filter((k) => k.toLowerCase() === "content-security-policy")).toHaveLength(1);
    expect(withCsp(`${BASE}/x`, undefined, BASE)["Content-Security-Policy"]).toEqual([DESKTOP_CSP]);
    const other = { a: ["1"] };
    expect(withCsp("https://example.com/", other, BASE)).toEqual(other);
    expect(withCsp(`${BASE}/`, other, null)).toEqual(other);
  });

  it("the CSP: only the local origin, no plugins, no framing, no foreign forms; inline needed by Next stays", () => {
    const d = Object.fromEntries(DESKTOP_CSP.split(";").map((p) => p.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["frame-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["connect-src"]).toEqual(["'self'"]);
    expect(DESKTOP_CSP).not.toContain("unsafe-eval");
    expect(DESKTOP_CSP).not.toMatch(/https?:|\*/);
  });

  it("permissions: only a clipboard write from the local page; everything else refused", () => {
    expect(allowPermission("clipboard-sanitized-write", `${BASE}/tasks/t_1`, BASE)).toBe(true);
    expect(allowPermission("clipboard-sanitized-write", "https://evil.example/", BASE)).toBe(false);
    for (const p of ["media", "geolocation", "notifications", "openExternal", "clipboard-read", "fileSystem", "unknown"]) expect(allowPermission(p, `${BASE}/`, BASE), p).toBe(false);
    expect(allowPermission("clipboard-sanitized-write", `${BASE}/`, null)).toBe(false);
  });
});
