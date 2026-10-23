import { DESKTOP_METHOD_NAMES, DesktopCommand, parseDesktopRequest, parseDesktopResponse } from "@mandat/contract";
import type { DesktopMethod, DesktopRequest, DesktopResult, DesktopValue } from "@mandat/contract";

// E9g A1 (D-371): the web end of the desktop bridge. In the desktop window the preload puts window.harnessDesktop there;
// everywhere else (a browser, the PWA) it is absent and desktopBridge() is null, so the web behaves exactly as before.
// Every request is parsed before it leaves, every answer and command after it arrives (packages/contract/src/desktop.ts).

export interface DesktopClient {
  call<M extends DesktopMethod>(method: M, request: DesktopRequest<M>): Promise<DesktopResult<DesktopValue<M>>>;
  onCommand(callback: (command: DesktopCommand) => void): () => void;
}

type RawBridge = Record<DesktopMethod, (payload: unknown) => Promise<unknown>> & { version: 1; onCommand: (cb: (c: unknown) => void) => () => void };

function rawBridge(scope: unknown): RawBridge | null {
  if (typeof scope !== "object" || scope === null || !("harnessDesktop" in scope)) return null;
  const b: unknown = (scope as { harnessDesktop: unknown }).harnessDesktop;
  if (typeof b !== "object" || b === null) return null;
  const r = b as Record<string, unknown>;
  if (r.version !== 1 || typeof r.onCommand !== "function") return null;
  return DESKTOP_METHOD_NAMES.every((m) => typeof r[m] === "function") ? (b as RawBridge) : null;
}

const currentWindow = (): unknown => (typeof window === "undefined" ? undefined : window);

/** True only inside the desktop window. */
export function isDesktop(scope: unknown = currentWindow()): boolean {
  return rawBridge(scope) !== null;
}

/** The bridge of the desktop window, or null (browser, PWA, server). */
export function desktopBridge(scope: unknown = currentWindow()): DesktopClient | null {
  const b = rawBridge(scope);
  if (!b) return null;
  return {
    async call(method, request) {
      const req = parseDesktopRequest(method as string, request);
      if (!req.ok) return req as DesktopResult<never>;
      let raw: unknown;
      try {
        raw = await b[method](req.value);
      } catch {
        return { ok: false, error: { code: "failed", message: "the desktop app did not answer" } };
      }
      return parseDesktopResponse(method, raw);
    },
    onCommand(callback) {
      return b.onCommand((c) => {
        const cmd = DesktopCommand.safeParse(c);
        if (cmd.success) callback(cmd.data);
      });
    },
  };
}
