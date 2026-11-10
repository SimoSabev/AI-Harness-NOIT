import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import { createSyncServer, memoryCache, memorySyncStore, unseal } from "@mandat/sync";
import { SealedSecret } from "@mandat/contract";
import { createAccountAuth, sessionHooks } from "./auth-server";
import { accountStatus, listDevices, pollSignIn, sealSecret, signOut, startSignIn, syncNow, unlockVault, wipeAccount, type AccountLink, type DeviceDeps, type LinkStore } from "./device";
import { handleSync } from "./sync-api";

// D-490…D-495 end to end, in process: a sync server (Better Auth + the sync API on a memory store) and two devices.
const SYNC = "http://127.0.0.1:4999";
const SECRET = "test-secret-not-real-0123456789abcdef0123456789"; // test value only
const KEY = "sk-ant-api03-TESTONLY-abcdefghijklmnopqrstuvwxyz0123";
const FAST = { n: 1024, r: 8, p: 1 };
let ip = 0;

function syncServer() {
  const mail: string[] = [];
  const auth = createAccountAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], deviceCode: [], rateLimit: [] }),
    secret: SECRET,
    baseURL: SYNC,
    trustedOrigins: [SYNC],
    sendMagicLink: ({ url }) => {
      mail.push(url);
      return Promise.resolve();
    },
  });
  const store = memorySyncStore();
  const server = createSyncServer(store);
  const hooks = sessionHooks(auth);
  const seen: string[] = []; // every request body the sync server received
  const addr = `198.51.100.${++ip}`;
  const handle = async (req: Request): Promise<Response> => {
    const body = req.method === "POST" ? await req.clone().text() : "";
    seen.push(body);
    const h = new Headers(req.headers);
    h.set("x-forwarded-for", addr);
    const r = new Request(req.url, { method: req.method, headers: h, body: req.method === "POST" ? body : undefined, redirect: "manual" });
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/account-auth/")) return auth.handler(r);
    if (path.startsWith("/api/sync/")) return handleSync(path.slice("/api/sync/".length), r, { server, ...hooks });
    return new Response("not found", { status: 404 });
  };
  const fetchFn = vi.fn((input: string | URL | Request, init?: RequestInit) => handle(new Request(input, init)));
  /** the person in the system browser: email link, then claim and approve the code */
  const approve = async (email: string, userCode: string) => {
    const post = (p: string, b: unknown, cookie = "") => handle(new Request(`${SYNC}/api/account-auth${p}`, { method: "POST", headers: { "content-type": "application/json", origin: SYNC, cookie }, body: JSON.stringify(b) }));
    await post("/sign-in/magic-link", { email, callbackURL: "/" });
    const v = await handle(new Request(mail.at(-1) as string, { redirect: "manual" }));
    const cookie = v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    await handle(new Request(`${SYNC}/api/account-auth/device?user_code=${encodeURIComponent(userCode)}`, { headers: { cookie } }));
    expect((await post("/device/approve", { userCode }, cookie)).status).toBe(200);
  };
  /** the person behind a device (read from the sync server by its token) */
  const uidOf = async (d: DeviceDeps): Promise<string> => {
    const id = await hooks.userOf(new Request(SYNC, { headers: { authorization: `Bearer ${(await d.links.get())?.token ?? ""}` } }));
    if (!id) throw new Error("no session");
    return id;
  };
  return { fetchFn, approve, seen, server, uidOf };
}

function memLinks(): LinkStore & { value: AccountLink | null } {
  const s = { value: null as AccountLink | null, get: () => Promise.resolve(s.value), set: (l: AccountLink | null) => ((s.value = l), Promise.resolve()) };
  return s;
}

async function signedInDevice(srv: ReturnType<typeof syncServer>, email: string): Promise<DeviceDeps & { links: ReturnType<typeof memLinks>; cache: ReturnType<typeof memoryCache> }> {
  vi.useFakeTimers({ toFake: ["Date"] });
  const d = { server: SYNC, links: memLinks(), cache: memoryCache([]), fetch: srv.fetchFn as unknown as typeof fetch };
  const st = await startSignIn(d);
  if (st.state !== "pending") throw new Error("not pending");
  expect(st.verificationUrl.startsWith(`${SYNC}/account/device`)).toBe(true);
  expect((await pollSignIn(d)).state).toBe("pending");
  await srv.approve(email, st.userCode);
  vi.setSystemTime(Date.now() + 6_000);
  expect(await pollSignIn(d)).toMatchObject({ state: "signed_in", email, vault: "locked" });
  vi.useRealTimers();
  return d;
}

describe("without an account nothing leaves the machine (D-490)", () => {
  it("no sync server configured: every call returns without a request", async () => {
    const fetchFn = vi.fn();
    const d: DeviceDeps = { server: null, links: memLinks(), cache: memoryCache([{ kind: "prefs", id: "ui", body: { lang: "bg" }, deleted: false }]), fetch: fetchFn as unknown as typeof fetch };
    expect(await accountStatus(d)).toEqual({ state: "unconfigured" });
    expect(await startSignIn(d)).toEqual({ state: "unconfigured" });
    expect(await syncNow(d)).toEqual({ state: "off" });
    expect(await listDevices(d)).toEqual([]);
    await signOut(d, true);
    await wipeAccount(d);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("a sync server configured but not signed in: still not one request", async () => {
    const fetchFn = vi.fn();
    const d: DeviceDeps = { server: SYNC, links: memLinks(), cache: memoryCache([{ kind: "task", id: "t_1", body: { text: "fix" }, deleted: false }]), fetch: fetchFn as unknown as typeof fetch };
    expect(await accountStatus(d)).toEqual({ state: "off" });
    expect(await syncNow(d)).toEqual({ state: "off" });
    expect(await listDevices(d)).toEqual([]);
    await expect(sealSecret(d, "anthropic", "Anthropic", KEY)).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await d.cache.all())[0]?.dirty).toBe(true);
  });
});

describe("with an account everything follows the person (D-492, D-493)", () => {
  it("signs in through the system browser and syncs to a second device; a key arrives sealed, never in clear", async () => {
    const srv = syncServer();
    const one = await signedInDevice(srv, "simo@example.test");
    await one.cache.edit("prefs", "ui", { lang: "bg", theme: "dark" });
    await one.cache.edit("project", "shop", { name: "shop", remote: "https://github.com/example/shop" });
    await unlockVault(one, "a long sync passphrase", FAST);
    await sealSecret(one, "anthropic", "Anthropic", KEY);
    expect(await syncNow(one)).toMatchObject({ state: "ok", pushed: 3 });

    // the key never reached the server in clear: not in any request body, not in the store
    expect(srv.seen.join("\n")).not.toContain(KEY);
    expect(srv.seen.join("\n")).not.toContain("sk-ant-");
    const onServer = (await srv.server.pull(await srv.uidOf(one), 0)).records;
    expect(onServer.map((r) => r.kind).sort()).toEqual(["prefs", "project", "secret"]);
    expect(JSON.stringify(onServer)).not.toContain(KEY);

    const two = await signedInDevice(srv, "simo@example.test");
    expect(await syncNow(two)).toMatchObject({ state: "ok", pulled: 3 });
    const got = Object.fromEntries((await two.cache.all()).map((e) => [`${e.kind}/${e.id}`, e.body]));
    expect(got["prefs/ui"]).toEqual({ lang: "bg", theme: "dark" });
    expect(got["project/shop"]).toMatchObject({ name: "shop" });
    // the second device opens the key only with the passphrase
    await expect(unlockVault(two, "the wrong passphrase!", FAST)).rejects.toThrow();
    await unlockVault(two, "a long sync passphrase", FAST);
    const sealed = SealedSecret.parse((got["secret/anthropic"] as { sealed: unknown }).sealed);
    expect(unseal(Buffer.from(two.links.value?.vaultKey as string, "base64url"), sealed, "secret/anthropic")).toBe(KEY);
  });

  it("lists devices, signs out everywhere, and wipes the person's data on the server", async () => {
    const srv = syncServer();
    const one = await signedInDevice(srv, "ana@example.test");
    const two = await signedInDevice(srv, "ana@example.test");
    const devices = await listDevices(one);
    expect(devices.length).toBeGreaterThanOrEqual(2);
    await signOut(one, true);
    expect(await accountStatus(one)).toEqual({ state: "off" });
    await expect(syncNow(two)).rejects.toThrow(/signed out/);

    const three = await signedInDevice(srv, "ana@example.test");
    await three.cache.edit("settings", "general", { a: 1 });
    await syncNow(three);
    const uid = await srv.uidOf(three);
    expect((await srv.server.pull(uid, 0)).records).toHaveLength(1);
    await wipeAccount(three);
    expect((await srv.server.pull(uid, 0)).records).toEqual([]);
    expect(await accountStatus(three)).toEqual({ state: "off" });
    expect((await three.cache.all()).map((e) => e.id)).toEqual(["general"]); // local data stays
  });
});

