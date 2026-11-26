import { describe, expect, it } from "vitest";
import { mintRunnerJwt, runnerJwtSecret, verifyRunnerJwt } from "./runner-jwt.js";

// E10 hosted (D-701): HS256 with node:crypto, one fixed header (no `alg` choice), ≤ 15 min, checked with zod.
const KEY = Buffer.from("k".repeat(48));
const RID = "3f2a6c1e-8b7d-4e5f-9a0b-1c2d3e4f5a6b";
const ORG = "a0000000-0000-4000-8000-00000000000a";
const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("runner JWT (D-701)", () => {
  it("mint → verify gives the claims; 15 minutes", () => {
    const { token, claims } = mintRunnerJwt(KEY, { runner: RID, org: ORG, kinds: ["baseline"] }, 1_000_000);
    expect(claims.exp - claims.iat).toBe(900);
    expect(verifyRunnerJwt(KEY, token, 1_000_000 + 899)).toEqual(claims);
    expect(token.split(".")).toHaveLength(3);
  });
  it("expired, another key, a changed payload, alg none or another header → null", () => {
    const { token } = mintRunnerJwt(KEY, { runner: RID, org: ORG, kinds: [] }, 1_000_000);
    expect(verifyRunnerJwt(KEY, token, 1_000_000 + 900)).toBeNull();
    expect(verifyRunnerJwt(Buffer.from("x".repeat(48)), token, 1_000_000)).toBeNull();
    const [h, p, s] = token.split(".") as [string, string, string];
    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(verifyRunnerJwt(KEY, `${h}.${b64(JSON.stringify({ ...claims, org: RID }))}.${s}`, 1_000_000)).toBeNull();
    expect(verifyRunnerJwt(KEY, `${b64('{"alg":"none","typ":"JWT"}')}.${p}.`, 1_000_000)).toBeNull();
    expect(verifyRunnerJwt(KEY, `${b64('{"typ":"JWT","alg":"HS256"}')}.${p}.${s}`, 1_000_000)).toBeNull();
    expect(verifyRunnerJwt(KEY, "a.b", 1_000_000)).toBeNull();
    expect(verifyRunnerJwt(KEY, `${h}.${b64("not json")}.${s}`, 1_000_000)).toBeNull();
  });
  it("issued in the future (more than a minute of clock skew) → null", () => {
    const { token } = mintRunnerJwt(KEY, { runner: RID, org: ORG, kinds: [] }, 2_000_000);
    expect(verifyRunnerJwt(KEY, token, 2_000_000 - 61)).toBeNull();
    expect(verifyRunnerJwt(KEY, token, 2_000_000 - 30)).not.toBeNull();
  });
  it("the secret: MANDAT_RUNNER_JWT_SECRET ≥ 32 characters, or a file; else the runner routes are off", () => {
    expect(runnerJwtSecret({ MANDAT_RUNNER_JWT_SECRET: "s".repeat(32) }, () => "")?.length).toBe(32);
    expect(runnerJwtSecret({ MANDAT_RUNNER_JWT_SECRET: "short" }, () => "")).toBeNull();
    expect(runnerJwtSecret({ MANDAT_RUNNER_JWT_SECRET_FILE: "/run/secrets/jwt" }, (f) => (f === "/run/secrets/jwt" ? "f".repeat(40) + "\n" : ""))?.length).toBe(40);
    expect(runnerJwtSecret({}, () => "")).toBeNull();
  });
});
