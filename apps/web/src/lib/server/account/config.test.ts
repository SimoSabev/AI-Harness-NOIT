import { describe, expect, it } from "vitest";
import { accountMenuState, syncServerConfig, syncUrl } from "./config";

const SECRET = "t".repeat(40); // test value only

describe("account config (D-496)", () => {
  it("no env → no account, no sync server (the default of `pnpm local`)", () => {
    expect(syncUrl({})).toBeNull();
    expect(syncServerConfig({})).toBeNull();
  });

  it("D-625: no sync server and not signed in → the profile is hidden (the rail icon, the Settings section, the tile)", () => {
    expect(accountMenuState(null, false)).toBe("hidden");
    expect(accountMenuState("https://sync.example.org", false)).toBe("off");
    expect(accountMenuState("https://sync.example.org", true)).toBe("signed_in");
    // a device still signed in after the address was removed keeps the page, so the person can sign out
    expect(accountMenuState(null, true)).toBe("signed_in");
  });

  it("the device accepts https, or http only on loopback", () => {
    expect(syncUrl({ MANDAT_SYNC_URL: "https://sync.example.org/x" })).toBe("https://sync.example.org");
    expect(syncUrl({ MANDAT_SYNC_URL: "http://127.0.0.1:4000" })).toBe("http://127.0.0.1:4000");
    expect(syncUrl({ MANDAT_SYNC_URL: "http://sync.example.org" })).toBeNull();
    expect(syncUrl({ MANDAT_SYNC_URL: "file:///etc/passwd" })).toBeNull();
  });

  it("the sync server needs a long secret, its address and a database", () => {
    const env = { MANDAT_SYNC_SERVER: "1", BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: "https://sync.example.org", MANDAT_SYNC_DB_URL: "postgresql://x" };
    expect(syncServerConfig(env)).toMatchObject({ baseURL: "https://sync.example.org", github: null, google: null });
    expect(syncServerConfig({ ...env, BETTER_AUTH_SECRET: "short" })).toBeNull();
    expect(syncServerConfig({ ...env, MANDAT_SYNC_SERVER: undefined })).toBeNull();
    const full = syncServerConfig({ ...env, MANDAT_AUTH_GITHUB_ID: "gh-id", MANDAT_AUTH_GITHUB_SECRET: "gh-test", MANDAT_SYNC_TRUSTED_ORIGINS: "https://app.example.org, http://evil.example" });
    expect(full?.github).toEqual({ clientId: "gh-id", clientSecret: "gh-test" });
    expect(full?.trustedOrigins).toEqual(["https://sync.example.org", "https://app.example.org"]);
  });
});
