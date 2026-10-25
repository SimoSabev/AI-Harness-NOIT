import { createHmac } from "node:crypto";
import type { Page } from "@playwright/test";

// Test-only credentials of the disposable e2e database (never the demo's real seed).
export const PASSWORD = "e2e-password-not-secret";
export const TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const EMAIL = { owner: "owner@demo.mandat.invalid", approver: "approver@demo.mandat.invalid", viewer: "viewer@demo.mandat.invalid" };

export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  // by field name, so the same helper signs in whatever the language of the page (E7е)
  await page.locator('form[action="/api/auth/login"] input[name="email"]').fill(email);
  await page.locator('form[action="/api/auth/login"] input[name="password"]').fill(PASSWORD);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL("**/");
}

/** RFC 6238 (the same algorithm as src/lib/server/totp.ts). */
export function totpNow(secretB32: string, ms: number = Date.now()): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let bits = 0;
  let v = 0;
  for (const ch of secretB32) {
    v = (v << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(ms / 30_000)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(c).digest();
  const off = (h[h.length - 1] as number) & 15;
  return ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}
