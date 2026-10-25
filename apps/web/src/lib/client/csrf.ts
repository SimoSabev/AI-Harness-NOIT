// D-368: the CSRF cookie of `pnpm local` (no login form sets it): base64url of 32 random bytes, like the login does.
export function localCsrfCookie(bytes: Uint8Array): string {
  const v = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `mandat_csrf=${v}; path=/; max-age=${30 * 24 * 3600}; samesite=strict`;
}
