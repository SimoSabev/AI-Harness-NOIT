import { describe, expect, it } from "vitest";
import { localCsrfCookie } from "./csrf";

// D-368: `pnpm local` has no login form, so the page itself sets the double-submit cookie (a random value; a foreign site
// cannot write cookies for 127.0.0.1/localhost, which is all double submit needs).
describe("localCsrfCookie (D-368)", () => {
  it("43 url-safe characters from 32 random bytes; strict, the whole site, 30 days", () => {
    const c = localCsrfCookie(new Uint8Array(32).fill(255));
    expect(c).toBe(`mandat_csrf=${"_".repeat(42)}8; path=/; max-age=2592000; samesite=strict`);
    const v = /^mandat_csrf=([^;]+);/.exec(localCsrfCookie(crypto.getRandomValues(new Uint8Array(32))))?.[1] ?? "";
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
