import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// E7в / D-345: the proxy starts locked with a one-time boot token (env MANDAT_PROXY_BOOT_TOKEN, TTL 60 s); the CLI that
// started it pushes the keys once over the loopback admin port. The keys then live only in the proxy's memory; the env
// (and `docker inspect`) shows a spent token. The spent mark (a hash) survives a container restart.
export const BOOT_TTL_MS = 60_000;
export function mintBootToken(): string {
  return `mdt_boot_${randomBytes(32).toString("base64url")}`;
}
export function bootTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export interface BootOptions {
  tokenHash: string;
  expiresAtMs: number;
  /** where the hash of a spent token is kept (the proxy state volume) */
  spentFile: string;
}
export class BootGate {
  private spent: boolean;
  constructor(private readonly o: BootOptions) {
    this.spent = existsSync(o.spentFile) && readFileSync(o.spentFile, "utf8").split("\n").includes(o.tokenHash);
  }
  /** true once, for the right unexpired token; false otherwise (never throws). */
  check(token: string | null, nowMs: number): boolean {
    if (this.spent || token === null || nowMs > this.o.expiresAtMs) return false;
    const a = Buffer.from(bootTokenHash(token));
    const b = Buffer.from(this.o.tokenHash);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  spend(): void {
    this.spent = true;
    try {
      writeFileSync(this.o.spentFile, `${this.o.tokenHash}\n`, { flag: "a", mode: 0o600 });
    } catch {
      // the in-memory mark still holds for this process
    }
  }
}
