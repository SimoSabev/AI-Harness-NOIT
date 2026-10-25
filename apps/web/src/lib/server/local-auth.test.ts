import { describe, expect, it } from "vitest";
import { factorAt } from "./actions";
import { isLoopbackHost, localOwner, localPresence, localUser } from "./local-auth";

// D-368: `pnpm local` without a login — the one local owner, only through a loopback Host; approvals are a click.
const OWNER = "d0000000-0000-4000-8000-0000000000a1";
const env = { MANDAT_LOCAL_OWNER: OWNER };

describe("local mode without a login (D-368)", () => {
  it("the owner comes from MANDAT_LOCAL_OWNER (a uuid); anything else → no local mode", () => {
    expect(localOwner(env)).toBe(OWNER);
    expect(localOwner({})).toBeNull();
    expect(localOwner({ MANDAT_LOCAL_OWNER: "owner" })).toBeNull();
    expect(localOwner({ MANDAT_LOCAL_OWNER: `${OWNER}x` })).toBeNull();
  });
  it("loopback Host only: localhost, 127.0.0.1 and [::1], with or without a port", () => {
    for (const h of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST:3000"]) expect(isLoopbackHost(h)).toBe(true);
    // DNS rebinding (evil.example → 127.0.0.1 keeps Host: evil.example), the LAN, look-alikes
    for (const h of [null, "", "evil.example:3000", "192.168.1.5:3000", "localhost.evil.example", "127.0.0.1.nip.io:3000", "0.0.0.0:3000", "localhost:3000@evil"]) expect(isLoopbackHost(h)).toBe(false);
  });
  it("localUser: the owner for a loopback Host, null otherwise or outside local mode", () => {
    expect(localUser(env, "localhost:3000")).toBe(OWNER);
    expect(localUser(env, "evil.example:3000")).toBeNull();
    expect(localUser({}, "localhost:3000")).toBeNull();
  });
  it("approvals: the local presence passes without a code (method local); the TOTP factor still needs one", async () => {
    const at = await factorAt(localPresence, { uid: OWNER });
    expect(at).toMatchObject({ method: "local" });
    expect(Math.abs((at as { at: Date }).at.getTime() - Date.now())).toBeLessThan(5000);
    const totp = async () => new Date();
    expect(await factorAt(totp, { uid: OWNER })).toEqual({ status: 403, body: { error: "second_factor_required" } });
    expect(await factorAt(totp, { uid: OWNER, code: "123456" })).toMatchObject({ method: "totp" });
    expect(await factorAt(async () => null, { uid: OWNER, code: "123456" })).toEqual({ status: 403, body: { error: "second_factor_invalid" } });
  });
});
