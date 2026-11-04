import "server-only";
import pg from "pg";
import { MandatError } from "@mandat/contract";
import { createSyncServer } from "@mandat/sync";
import { authMode, currentUser } from "../auth";
import { db } from "../db";
import { RateLimiter } from "../guard";
import type { Db } from "../sql";
import type { AccountApiDeps } from "./account-api";
import { createAccountAuth, sessionHooks, type AccountAuth } from "./auth-server";
import { syncServerConfig, syncUrl } from "./config";
import type { SyncApiDeps } from "./sync-api";
import { pgCache, pgLinkStore } from "./local-store";
import { pgSyncStore } from "./sync-store";

// D-496, D-497: the account's wiring for the Route Handlers. The device side lives in `pnpm local`; the sync server
// side only where MANDAT_SYNC_SERVER=1 and its env is complete. Requests to the sync server time out after 15 s.
const limiter = new RateLimiter(10, 60_000);
const TIMEOUT_MS = 15_000;
const timed: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

export function accountDeps(): AccountApiDeps {
  const d = db();
  return {
    local: authMode() === "local",
    user: () => currentUser(),
    device: () => ({ server: syncUrl(), links: pgLinkStore(d), cache: pgCache(d), fetch: timed }),
    db: d,
    limiter,
  };
}

let server: { auth: AccountAuth; api: SyncApiDeps } | null = null;

/** The sync server's Better Auth and sync API, or null when this web is not a sync server. */
export function syncServerSide(): { auth: AccountAuth; api: SyncApiDeps } | null {
  const c = syncServerConfig();
  if (!c) return null;
  if (server) return server;
  const pool = new pg.Pool({ connectionString: c.dbUrl, max: 10, idleTimeoutMillis: 10_000 });
  const auth = createAccountAuth({
    database: pool,
    secret: c.secret,
    baseURL: c.baseURL,
    trustedOrigins: c.trustedOrigins,
    github: c.github,
    google: c.google,
    // Q-107: no mail sender is chosen yet, so the email link is off on the real server; GitHub and Google work
    sendMagicLink: () => Promise.reject(new MandatError("E_SYNC_OFF", "email sign-in is not set up on this server")),
  });
  const sql: Db = {
    query: async (text, params) => ({ rows: (await pool.query(text, params)).rows }),
    connect: async () => {
      const cl = await pool.connect();
      return { query: async (text, params) => ({ rows: (await cl.query(text, params)).rows }), release: () => cl.release() };
    },
  };
  server = { auth, api: { server: createSyncServer(pgSyncStore(sql)), ...sessionHooks(auth) } };
  return server;
}

/** Which ways in the sync server offers (for its sign-in page). */
export function signInMethods(): { github: boolean; google: boolean; email: boolean } {
  const c = syncServerConfig();
  return { github: Boolean(c?.github), google: Boolean(c?.google), email: false };
}
