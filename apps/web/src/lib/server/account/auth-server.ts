import { betterAuth } from "better-auth";
import { bearer, deviceAuthorization, magicLink } from "better-auth/plugins";

// D-490, D-495: the sync server's sign-in — Better Auth (MIT), only when this web runs as the sync server
// (MANDAT_SYNC_SERVER=1). Ways in: GitHub, Google (when their OAuth apps are configured) and a link by email. A
// device (`pnpm local`, the desktop) never shows a password form: it starts the device flow (RFC 8628) and the person
// approves it in the system browser; the device then holds a session token (bearer plugin), never a cookie of the
// browser. Cookies are httpOnly (Better Auth's default), Secure on https, SameSite=Lax; Better Auth rejects a
// state-changing request whose Origin is not trusted (CSRF); sign-in is rate limited.

export const DEVICE_CLIENT_ID = "mandat-device";
export const AUTH_BASE_PATH = "/api/account-auth";

export interface OAuthApp { clientId: string; clientSecret: string }
export interface AccountAuthOptions {
  /** a pg Pool in production; the memory adapter in tests */
  database: Parameters<typeof betterAuth>[0]["database"];
  secret: string;
  baseURL: string;
  trustedOrigins?: string[];
  github?: OAuthApp | null;
  google?: OAuthApp | null;
  sendMagicLink: (to: { email: string; url: string }) => Promise<void>;
}

export function createAccountAuth(o: AccountAuthOptions) {
  return betterAuth({
    appName: "Mandat",
    basePath: AUTH_BASE_PATH,
    baseURL: o.baseURL,
    secret: o.secret,
    database: o.database,
    trustedOrigins: o.trustedOrigins ?? [],
    telemetry: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    socialProviders: {
      ...(o.github ? { github: { clientId: o.github.clientId, clientSecret: o.github.clientSecret } } : {}),
      ...(o.google ? { google: { clientId: o.google.clientId, clientSecret: o.google.clientSecret } } : {}),
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/magic-link": { window: 60, max: 3 },
        "/sign-in/social": { window: 60, max: 10 },
        "/device/code": { window: 60, max: 5 },
      },
    },
    // explicit: Better Auth skips the Origin check under a test runner by default; Mandat keeps it on everywhere
    advanced: { cookiePrefix: "mandat", useSecureCookies: o.baseURL.startsWith("https://"), disableOriginCheck: false, disableCSRFCheck: false },
    plugins: [
      magicLink({ expiresIn: 600, sendMagicLink: ({ email, url }) => o.sendMagicLink({ email, url }) }),
      deviceAuthorization({
        verificationUri: "/account/device",
        expiresIn: "10m",
        interval: "5s",
        validateClient: (id) => id === DEVICE_CLIENT_ID,
      }),
      bearer(),
    ],
  });
}

export type AccountAuth = ReturnType<typeof createAccountAuth>;

/** The person behind a device's bearer token, and deleting that person's sign-in record (sessions, linked accounts, user). */
export function sessionHooks(auth: AccountAuth): { userOf: (req: Request) => Promise<string | null>; deleteUser: (req: Request) => Promise<void> } {
  const userOf = async (req: Request) => (await auth.api.getSession({ headers: req.headers }))?.user.id ?? null;
  return {
    userOf,
    deleteUser: async (req) => {
      const uid = await userOf(req);
      if (uid) await (await auth.$context).internalAdapter.deleteUser(uid);
    },
  };
}
