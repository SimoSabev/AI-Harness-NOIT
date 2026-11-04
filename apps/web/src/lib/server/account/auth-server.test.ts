import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import { createAccountAuth, DEVICE_CLIENT_ID } from "./auth-server";

// D-495: the sign-in works end to end with a test provider — a magic link captured in memory instead of an email.
const BASE = "http://sync.test";
const SECRET = "test-secret-not-real-0123456789abcdef0123456789"; // test value only

let ipSeq = 0;
function setup() {
  const ip = `203.0.113.${++ipSeq}`;
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [], deviceCode: [], rateLimit: [] };
  const mail: { email: string; url: string }[] = [];
  const auth = createAccountAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseURL: BASE,
    trustedOrigins: [BASE],
    sendMagicLink: (m) => {
      mail.push(m);
      return Promise.resolve();
    },
  });
  const call = (path: string, init: RequestInit & { json?: unknown; ip?: string } = {}) => {
    const headers = new Headers(init.headers);
    headers.set("x-forwarded-for", init.ip ?? ip);
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      if (!headers.has("origin")) headers.set("origin", BASE);
    }
    return auth.handler(new Request(`${BASE}/api/account-auth${path}`, { ...init, headers, body: init.json === undefined ? init.body : JSON.stringify(init.json) }));
  };
  return { auth, mail, call };
}

const cookieOf = (r: Response): string => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function signIn(s: ReturnType<typeof setup>, email: string): Promise<string> {
  const r = await s.call("/sign-in/magic-link", { method: "POST", json: { email, callbackURL: "/" } });
  expect(r.status).toBe(200);
  const link = s.mail.at(-1)?.url;
  if (!link) throw new Error("no link");
  const v = await s.call(new URL(link).pathname.replace("/api/account-auth", "") + new URL(link).search, { method: "GET", redirect: "manual" });
  expect([200, 302]).toContain(v.status);
  const cookie = cookieOf(v);
  expect(cookie).toContain("mandat.session_token=");
  return cookie;
}

describe("Better Auth on the sync server (D-495)", () => {
  it("signs in with the test provider (magic link) and the session cookie is httpOnly", async () => {
    const s = setup();
    const r = await s.call("/sign-in/magic-link", { method: "POST", json: { email: "simo@example.test", callbackURL: "/" } });
    expect(r.status).toBe(200);
    const url = new URL(s.mail[0]?.url ?? "");
    const v = await s.call(url.pathname.replace("/api/account-auth", "") + url.search, { method: "GET", redirect: "manual" });
    const raw = v.headers.getSetCookie().find((c) => c.startsWith("mandat.session_token="));
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    const me = await s.call("/get-session", { headers: { cookie: cookieOf(v) } });
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe("simo@example.test");
  });

  it("a device gets a bearer token through the device flow, approved in the browser", async () => {
    const s = setup();
    const code = await s.call("/device/code", { method: "POST", json: { client_id: DEVICE_CLIENT_ID } });
    const c = (await code.json()) as { device_code: string; user_code: string; verification_uri: string };
    expect(c.verification_uri).toContain("/account/device");
    const pending = await s.call("/device/token", { method: "POST", json: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: c.device_code, client_id: DEVICE_CLIENT_ID } });
    expect(((await pending.json()) as { error: string }).error).toBe("authorization_pending");

    const cookie = await signIn(s, "simo@example.test");
    // the verifying page first claims the code for the signed-in session, then the person approves it
    expect((await s.call(`/device?user_code=${encodeURIComponent(c.user_code)}`, { headers: { cookie } })).status).toBe(200);
    const ok = await s.call("/device/approve", { method: "POST", headers: { cookie }, json: { userCode: c.user_code } });
    expect(ok.status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6_000); // the device waits the polling interval (5 s) before asking again
    const tok = await s.call("/device/token", { method: "POST", json: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: c.device_code, client_id: DEVICE_CLIENT_ID } });
    const t = (await tok.json()) as { access_token: string };
    vi.useRealTimers();
    expect(t.access_token).toBeTruthy();
    const me = await s.call("/get-session", { headers: { authorization: `Bearer ${t.access_token}` } });
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe("simo@example.test");
  });

  it("refuses a device flow from an unknown client", async () => {
    const s = setup();
    const r = await s.call("/device/code", { method: "POST", json: { client_id: "someone-else" } });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("CSRF: a cross-site POST with the session cookie is refused", async () => {
    const s = setup();
    const cookie = await signIn(s, "simo@example.test");
    const r = await s.call("/revoke-sessions", { method: "POST", headers: { cookie, origin: "https://evil.example" }, json: {} });
    expect(r.status).toBe(403);
    const me = await s.call("/get-session", { headers: { cookie } });
    expect(((await me.json()) as { user: { email: string } } | null)?.user.email).toBe("simo@example.test");
  });

  it("rate limit: the fourth sign-in link in a minute from one address is refused", async () => {
    const s = setup();
    const send = () => s.call("/sign-in/magic-link", { method: "POST", json: { email: "x@example.test", callbackURL: "/" } });
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });

  it("sign out everywhere ends every session of that person", async () => {
    const s = setup();
    const a = await signIn(s, "simo@example.test");
    const b = await signIn(s, "simo@example.test");
    const list = await s.call("/list-sessions", { headers: { cookie: a } });
    expect(((await list.json()) as unknown[]).length).toBe(2);
    expect((await s.call("/revoke-sessions", { method: "POST", headers: { cookie: a }, json: {} })).status).toBe(200);
    expect(await (await s.call("/get-session", { headers: { cookie: b } })).json()).toBeNull();
  });
});
