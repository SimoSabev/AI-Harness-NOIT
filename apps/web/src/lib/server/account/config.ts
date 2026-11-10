// D-496: the account's settings come only from env (names in .env.example, values never in the repo).
// Two roles, one code base:
//  - the sync server: MANDAT_SYNC_SERVER=1 + BETTER_AUTH_SECRET + BETTER_AUTH_URL + MANDAT_SYNC_DB_URL (+ OAuth apps);
//  - a device (`pnpm local`, the desktop): MANDAT_SYNC_URL = the sync server's address. Without it there is no
//    "Sign in" at all beyond an explanation, and nothing ever leaves the machine.
type Env = Record<string, string | undefined>;

export interface OAuthPair { clientId: string; clientSecret: string }
export interface SyncServerConfig {
  secret: string;
  baseURL: string;
  dbUrl: string;
  github: OAuthPair | null;
  google: OAuthPair | null;
  trustedOrigins: string[];
}

const httpUrl = (v: string | undefined): string | null => {
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname))) return null;
    return u.origin;
  } catch {
    return null;
  }
};
const pair = (id: string | undefined, secret: string | undefined): OAuthPair | null => (id && secret ? { clientId: id, clientSecret: secret } : null);

/** null unless this web is the sync server and everything it needs is set. */
export function syncServerConfig(env: Env = process.env): SyncServerConfig | null {
  if (env.MANDAT_SYNC_SERVER !== "1") return null;
  const baseURL = httpUrl(env.BETTER_AUTH_URL);
  const secret = env.BETTER_AUTH_SECRET ?? "";
  const dbUrl = env.MANDAT_SYNC_DB_URL ?? "";
  if (!baseURL || secret.length < 32 || !dbUrl) return null;
  const extra = (env.MANDAT_SYNC_TRUSTED_ORIGINS ?? "").split(",").map((s) => httpUrl(s.trim())).filter((s): s is string => s !== null);
  return {
    secret,
    baseURL,
    dbUrl,
    github: pair(env.MANDAT_AUTH_GITHUB_ID, env.MANDAT_AUTH_GITHUB_SECRET),
    google: pair(env.MANDAT_AUTH_GOOGLE_ID, env.MANDAT_AUTH_GOOGLE_SECRET),
    trustedOrigins: [baseURL, ...extra],
  };
}

/** The sync server this device signs in to; null = no account possible (the default). https only, except loopback. */
export function syncUrl(env: Env = process.env): string | null {
  return httpUrl(env.MANDAT_SYNC_URL);
}
