import { existsSync } from "node:fs";
import path from "node:path";

// E7в (AC-3.8): `pnpm local` restarts the proxy from the sealed keys when it is gone or came back locked.
/** keys.sealed.json exists (no KEK needed to know that). */
export function hasSealedKeys(home: string): boolean {
  return existsSync(path.join(home, "keys.sealed.json"));
}
/** true = not running, unhealthy or locked (its boot token is spent): it needs a start with the stored keys. */
export async function proxyLocked(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) });
    if (r.status !== 200) return true;
    const j = (await r.json()) as { locked?: unknown };
    return j.locked === true;
  } catch {
    return true;
  }
}
