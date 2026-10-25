import { allowedUrl } from "./banner.js";

// D-303 + D-371: the locks of the desktop window as pure parts, so they are tested without Electron. main.ts attaches
// them to the real webContents and session. `base` is the local address of `pnpm local`; null until its banner came.

export interface GuardEvent {
  url: string;
  preventDefault(): void;
}

/** The part of webContents the guard needs (Electron 44: setWindowOpenHandler, will-navigate, will-frame-navigate, will-redirect, will-attach-webview). */
export interface GuardTarget {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
  on(event: string, listener: (e: GuardEvent) => void): unknown;
}

/**
 * The policy of the desktop window. Next.js App Router puts its flight data in inline scripts and styles in inline
 * attributes; without a nonce they need 'unsafe-inline' (D-371). No eval, no other origin, no plugins, no frames.
 */
export const DESKTOP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * E9g review: a link the page opens in a new window (target=_blank: the subscription login of D-369, research sources,
 * links in task text) — the URL to hand to the system browser, or null. Only http(s), never the local address, no
 * user:password@, at most 2048 characters; file:, javascript:, data: and app schemes (vscode://, smb://) never leave.
 */
export function outsideUrl(url: string, base: string | null): string | null {
  if (url.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username !== "" || u.password !== "") return null;
  if (base !== null && allowedUrl(url, base)) return null;
  return u.href;
}

/** The window locks. `openOutside` (shell.openExternal in main) gets the links outsideUrl lets out; no in-app window ever opens. */
export function attachGuards(target: GuardTarget, base: () => string | null, openOutside?: (url: string) => void): void {
  target.setWindowOpenHandler((details) => {
    const out = openOutside ? outsideUrl(details.url, base()) : null;
    if (out !== null) openOutside?.(out);
    return { action: "deny" };
  });
  const stayLocal = (e: GuardEvent): void => {
    const b = base();
    if (!b || !allowedUrl(e.url, b)) e.preventDefault();
  };
  target.on("will-navigate", stayLocal);
  target.on("will-frame-navigate", stayLocal);
  target.on("will-redirect", stayLocal);
  target.on("will-attach-webview", (e) => e.preventDefault());
}

/** The response headers with the desktop CSP, for responses of the local address only (any CSP the page sent is replaced). */
export function withCsp(url: string, headers: Record<string, string[]> | undefined, base: string | null): Record<string, string[]> {
  const h = headers ?? {};
  if (!base || !allowedUrl(url, base)) return h;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() !== "content-security-policy") out[k] = v;
  out["Content-Security-Policy"] = [DESKTOP_CSP];
  return out;
}

/** Web permissions: the local page may write the clipboard (copy buttons); nothing else, from nowhere else. */
export function allowPermission(permission: string, requestingUrl: string, base: string | null): boolean {
  return base !== null && permission === "clipboard-sanitized-write" && allowedUrl(requestingUrl, base);
}
