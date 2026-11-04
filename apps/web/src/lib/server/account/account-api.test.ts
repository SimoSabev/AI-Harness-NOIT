import { describe, expect, it, vi } from "vitest";
import { memoryCache } from "@mandat/sync";
import { RateLimiter } from "../guard";
import { handleAccount, type AccountApiDeps } from "./account-api";
import type { AccountLink, DeviceDeps } from "./device";

// D-497: the device's account API: local only, Origin + CSRF on every POST, rate limit, no token in any answer.
const ORIGIN = "http://127.0.0.1:3000";
const CSRF = "c".repeat(43);

function deps(over: Partial<AccountApiDeps> = {}, link: AccountLink | null = null, server: string | null = "https://sync.example.org") {
  const fetchFn = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
  let l = link;
  const device: DeviceDeps = { server, links: { get: () => Promise.resolve(l), set: (x) => ((l = x), Promise.resolve()) }, cache: memoryCache([]), fetch: fetchFn as unknown as typeof fetch };
  const d: AccountApiDeps = { local: true, user: () => Promise.resolve("00000000-0000-4000-8000-000000000001"), device: () => device, limiter: new RateLimiter(3, 60_000), ...over };
  return { d, fetchFn };
}
const post = (op: string, body: unknown = {}, h: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/account/${op}`, { method: "POST", headers: { host: "127.0.0.1:3000", origin: ORIGIN, cookie: `mandat_csrf=${CSRF}`, "x-mandat-csrf": CSRF, "content-type": "application/json", ...h }, body: JSON.stringify(body) });
const get = (op: string) => new Request(`${ORIGIN}/api/account/${op}`, { headers: { host: "127.0.0.1:3000" } });

describe("account API (D-497)", () => {
  it("is there only in `pnpm local`, and only for the person at this computer", async () => {
    expect((await handleAccount("status", get("status"), deps({ local: false }).d)).status).toBe(404);
    expect((await handleAccount("status", get("status"), deps({ user: () => Promise.resolve(null) }).d)).status).toBe(401);
  });

  it("without a sync server the status says so and nothing is fetched", async () => {
    const { d, fetchFn } = deps({}, null, null);
    expect(await (await handleAccount("status", get("status"), d)).json()).toEqual({ state: "unconfigured" });
    expect(await (await handleAccount("start", post("start"), d)).json()).toEqual({ state: "unconfigured" });
    expect(await (await handleAccount("sync", post("sync"), d)).json()).toEqual({ state: "off" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("CSRF: a POST without our Origin or without the double-submit token is refused", async () => {
    const { d, fetchFn } = deps();
    expect((await handleAccount("start", post("start", {}, { origin: "https://evil.example" }), d)).status).toBe(403);
    expect((await handleAccount("start", post("start", {}, { "x-mandat-csrf": "x".repeat(43) }), d)).status).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rate limit on the sign-in steps; an unreachable sync server is a plain error", async () => {
    const { d } = deps();
    for (let i = 0; i < 3; i++) expect(await (await handleAccount("start", post("start"), d)).json()).toEqual({ error: "sync_unreachable" });
    expect((await handleAccount("start", post("start"), d)).status).toBe(429);
  });

  it("the answers never carry the session token or the vault key", async () => {
    const { d } = deps({}, { server: "https://sync.example.org", state: "signed_in", token: "tok-SECRET-test", email: "a@b.c", vaultKey: "k".repeat(43), lastSync: null });
    const text = await (await handleAccount("status", get("status"), d)).text();
    expect(JSON.parse(text)).toMatchObject({ state: "signed_in", vault: "open" });
    expect(text).not.toContain("tok-SECRET-test");
    expect(text).not.toContain("k".repeat(43));
  });

  it("wipe needs an explicit confirmation; a short passphrase is refused before any request", async () => {
    const { d, fetchFn } = deps({}, { server: "https://sync.example.org", state: "signed_in", token: "t", email: "a@b.c", vaultKey: null, lastSync: null });
    expect((await handleAccount("wipe", post("wipe", {}), d)).status).toBe(400);
    expect((await handleAccount("vault", post("vault", { passphrase: "short" }), d)).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
