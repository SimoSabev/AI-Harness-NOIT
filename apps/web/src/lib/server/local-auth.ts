import type { SecondFactor } from "./actions";

// D-368: `pnpm local` has no login — whoever sits at this computer is the one local owner (MANDAT_LOCAL_OWNER, set by
// the CLI). The web listens on 127.0.0.1 only, and a request counts only with a loopback Host: a page that rebinds its
// own name to 127.0.0.1 keeps its own Host and gets nothing. Approvals are a click (the local presence), recorded as
// method 'local' — never as a TOTP that did not happen.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function localOwner(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.MANDAT_LOCAL_OWNER;
  return v && UUID.test(v) ? v : null;
}

export function isLoopbackHost(host: string | null | undefined): boolean {
  return host != null && /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(host);
}

export function localUser(env: Record<string, string | undefined>, host: string | null | undefined): string | null {
  const owner = localOwner(env);
  return owner && isLoopbackHost(host) ? owner : null;
}

export const localPresence: SecondFactor = Object.assign(() => Promise.resolve(new Date()), { local: true as const });
