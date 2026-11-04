import { AccountDevice, MandatError, SyncPullResult, SyncPushResult, WrappedVaultKey, type AccountStatus } from "@mandat/contract";
import { createSyncEngine, createVault, openVault, seal, type LocalCache, type SyncPass, type SyncTransport } from "@mandat/sync";
import { z } from "zod";
import { AUTH_BASE_PATH, DEVICE_CLIENT_ID } from "./auth-server";

// D-490, D-495: the device side of the optional account (`pnpm local`, the desktop). Signing in is the device flow:
// this server asks the sync server for a code, the person opens the address in the system browser, signs in there
// (GitHub, Google, email link) and approves; this server polls and keeps the session token in its own database. The
// browser on 127.0.0.1 never sees the token. With no sync server configured, or no link, every function here returns
// without a single request (D-490: nothing leaves the machine without an account).

export interface AccountLink {
  server: string;
  state: "pending" | "signed_in";
  deviceCode?: string;
  userCode?: string;
  verificationUrl?: string;
  expiresAt?: string;
  token?: string;
  email?: string;
  /** the opened vault key (base64url); stays on this machine */
  vaultKey?: string | null;
  lastSync?: string | null;
}
export interface LinkStore {
  get(): Promise<AccountLink | null>;
  set(l: AccountLink | null): Promise<void>;
}
export interface DeviceDeps {
  server: string | null;
  links: LinkStore;
  cache: LocalCache;
  fetch: typeof fetch;
  now?: () => Date;
}

const CodeReply = z.object({ device_code: z.string().min(1), user_code: z.string().min(1), verification_uri: z.string(), verification_uri_complete: z.string().optional(), expires_in: z.number() });
const TokenReply = z.union([z.object({ access_token: z.string().min(1) }), z.object({ error: z.string() })]);
const SessionReply = z.object({ user: z.object({ email: z.string() }) }).nullable();
const SessionList = z.array(z.object({ id: z.string(), token: z.string().optional(), userAgent: z.string().nullish(), updatedAt: z.string() }));

async function call(d: DeviceDeps, link: AccountLink | null, path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<Response> {
  const headers: Record<string, string> = { origin: link?.server ?? (d.server as string) };
  if (link?.token) headers.authorization = `Bearer ${link.token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return d.fetch(`${link?.server ?? d.server}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", cache: "no-store" });
}

const signedIn = async (d: DeviceDeps): Promise<AccountLink | null> => {
  if (!d.server) return null;
  const l = await d.links.get();
  return l?.state === "signed_in" && l.token && l.server === d.server ? l : null;
};

export async function accountStatus(d: DeviceDeps): Promise<AccountStatus> {
  if (!d.server) return { state: "unconfigured" };
  const l = await d.links.get();
  if (!l || l.server !== d.server) return { state: "off" };
  if (l.state === "pending" && l.userCode && l.verificationUrl && l.expiresAt) return { state: "pending", userCode: l.userCode, verificationUrl: l.verificationUrl, expiresAt: l.expiresAt };
  if (l.state === "signed_in" && l.email) return { state: "signed_in", email: l.email, server: l.server, lastSync: l.lastSync ?? null, vault: l.vaultKey ? "open" : "locked" };
  return { state: "off" };
}

export async function startSignIn(d: DeviceDeps): Promise<AccountStatus> {
  if (!d.server) return { state: "unconfigured" };
  const r = await call(d, null, `${AUTH_BASE_PATH}/device/code`, { client_id: DEVICE_CLIENT_ID });
  const c = CodeReply.parse(await r.json());
  const now = (d.now ?? (() => new Date()))();
  const verificationUrl = new URL(c.verification_uri_complete ?? c.verification_uri, d.server).toString();
  await d.links.set({ server: d.server, state: "pending", deviceCode: c.device_code, userCode: c.user_code, verificationUrl, expiresAt: new Date(now.getTime() + c.expires_in * 1000).toISOString() });
  return accountStatus(d);
}

export async function pollSignIn(d: DeviceDeps): Promise<AccountStatus> {
  const l = await d.links.get();
  if (!d.server || l?.state !== "pending" || !l.deviceCode) return accountStatus(d);
  const r = await call(d, null, `${AUTH_BASE_PATH}/device/token`, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: l.deviceCode, client_id: DEVICE_CLIENT_ID });
  const t = TokenReply.parse(await r.json());
  if ("error" in t) {
    if (t.error === "access_denied" || t.error === "expired_token" || t.error === "invalid_grant") await d.links.set(null);
    return accountStatus(d);
  }
  const me = SessionReply.parse(await (await call(d, { server: d.server, state: "signed_in", token: t.access_token }, `${AUTH_BASE_PATH}/get-session`)).json());
  if (!me) throw new MandatError("E_SYNC_OFF", "the sync server did not accept the new session");
  await d.links.set({ server: d.server, state: "signed_in", token: t.access_token, email: me.user.email, vaultKey: null, lastSync: null });
  return accountStatus(d);
}

/** Sign out here (keeps every local record), or everywhere (ends every session of the person). */
export async function signOut(d: DeviceDeps, everywhere: boolean): Promise<void> {
  const l = await signedIn(d);
  if (l) await call(d, l, `${AUTH_BASE_PATH}/${everywhere ? "revoke-sessions" : "sign-out"}`, {}).catch(() => undefined);
  await d.links.set(null);
}

export async function listDevices(d: DeviceDeps): Promise<AccountDevice[]> {
  const l = await signedIn(d);
  if (!l) return [];
  const list = SessionList.parse(await (await call(d, l, `${AUTH_BASE_PATH}/list-sessions`)).json());
  return list.map((s) => AccountDevice.parse({ id: s.id, label: s.userAgent ?? "", lastSeen: new Date(s.updatedAt).toISOString(), current: s.token !== undefined && s.token === l.token }));
}

/** Opens the vault with the passphrase; the first device makes it (and sends only the wrapped key). */
export async function unlockVault(d: DeviceDeps, passphrase: string, cost?: { n: number; r: number; p: number }): Promise<void> {
  const l = await signedIn(d);
  if (!l) throw new MandatError("E_SYNC_OFF", "not signed in");
  const got = z.object({ wrapped: WrappedVaultKey.nullable() }).parse(await (await call(d, l, "/api/sync/vault")).json());
  let key: Buffer;
  if (got.wrapped) key = openVault(passphrase, got.wrapped);
  else {
    const v = createVault(passphrase, cost);
    const r = await call(d, l, "/api/sync/vault", { wrapped: v.wrapped });
    if (r.status !== 200) throw new MandatError("E_SYNC_VAULT", "the sync server did not keep the vault");
    key = v.key;
  }
  await d.links.set({ ...l, vaultKey: key.toString("base64url") });
}

/** A key to follow the person: sealed here, only the envelope goes into the sync cache. */
export async function sealSecret(d: DeviceDeps, id: string, label: string, plaintext: string): Promise<void> {
  const l = await signedIn(d);
  if (!l?.vaultKey) throw new MandatError("E_SYNC_VAULT", "the vault is locked");
  const cur = (await d.cache.all()).find((e) => e.kind === "secret" && e.id === id);
  await d.cache.put({ kind: "secret", id, deleted: false, body: { label, sealed: seal(Buffer.from(l.vaultKey, "base64url"), plaintext, `secret/${id}`) }, rev: cur?.rev ?? 0, base: cur?.base ?? null, dirty: true });
}

function transportOf(d: DeviceDeps, l: AccountLink): SyncTransport {
  const post = async (op: string, body: unknown) => {
    const r = await call(d, l, `/api/sync/${op}`, body);
    if (r.status === 401) throw new MandatError("E_SYNC_OFF", "signed out on the sync server");
    if (r.status !== 200) throw new MandatError("E_SYNC_OFF", `the sync server answered ${r.status}`);
    return r.json() as Promise<unknown>;
  };
  return {
    pull: async (since) => SyncPullResult.parse(await post("pull", { since })),
    push: async (req) => SyncPushResult.parse(await post("push", req)),
  };
}

export async function syncNow(d: DeviceDeps): Promise<SyncPass> {
  const l = await signedIn(d);
  const engine = createSyncEngine({ transport: () => Promise.resolve(l ? transportOf(d, l) : null), cache: d.cache });
  const pass = await engine.syncOnce();
  if (l && pass.state === "ok") await d.links.set({ ...l, lastSync: (d.now ?? (() => new Date()))().toISOString() });
  return pass;
}

/** Deletes everything of this person on the sync server (records, vault, sign-in) and signs this device out. Local data stays. */
export async function wipeAccount(d: DeviceDeps): Promise<void> {
  const l = await signedIn(d);
  if (!l) return;
  const r = await call(d, l, "/api/sync/wipe", {});
  if (r.status !== 200) throw new MandatError("E_SYNC_OFF", `the sync server answered ${r.status}`);
  await d.links.set(null);
}
