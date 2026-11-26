import { describe, expect, it } from "vitest";
import { RUNNER_KINDS, RunnerClaimBody, RunnerFailBody, RunnerJwtClaims, RunnerOutboxRow, RunnerRegisterBody, RunnerTokenBody, RunnerTokenReply, runnerRoute } from "./runner.js";

// E10 hosted (D-701): the runner protocol is data at the edge — every body and reply is a strict zod schema.
const REG = "mrr_" + "a".repeat(64);
const SECRET = "mrs_" + "b".repeat(64);
const RID = "3f2a6c1e-8b7d-4e5f-9a0b-1c2d3e4f5a6b";

describe("runner protocol (D-701)", () => {
  it("register: one-time token, name, kinds from the allow-list only", () => {
    expect(RunnerRegisterBody.parse({ token: REG, name: "vps-1", kinds: ["baseline", "mcp_vet"] })).toEqual({ token: REG, name: "vps-1", kinds: ["baseline", "mcp_vet"] });
    expect(() => RunnerRegisterBody.parse({ token: "mrr_short", name: "x", kinds: [] })).toThrow();
    expect(() => RunnerRegisterBody.parse({ token: REG, name: "x", kinds: ["merge"] })).toThrow(); // GitHub effects stay on the hosted worker
    expect(() => RunnerRegisterBody.parse({ token: REG, name: "x y\n", kinds: [] })).toThrow();
    expect(() => RunnerRegisterBody.parse({ token: REG, name: "x", kinds: [], extra: 1 })).toThrow();
  });
  it("token: runner id + its secret; reply carries the JWT and its expiry", () => {
    expect(RunnerTokenBody.parse({ runner_id: RID, secret: SECRET }).runner_id).toBe(RID);
    expect(() => RunnerTokenBody.parse({ runner_id: "x", secret: SECRET })).toThrow();
    expect(() => RunnerTokenBody.parse({ runner_id: RID, secret: "mrs_" })).toThrow();
    expect(RunnerTokenReply.parse({ token: "a.b.c", expires_at: "2026-11-26T10:00:00.000Z" }).token).toBe("a.b.c");
  });
  it("JWT claims: sub = runner, org, kinds, iat < exp ≤ 15 min", () => {
    const c = { iss: "mandat-hosted", aud: "mandat-runner", sub: RID, org: RID, kinds: ["baseline"], iat: 1000, exp: 1900, jti: "c".repeat(32) };
    expect(RunnerJwtClaims.parse(c)).toEqual(c);
    expect(() => RunnerJwtClaims.parse({ ...c, exp: 1000 + 16 * 60 })).toThrow();
    expect(() => RunnerJwtClaims.parse({ ...c, exp: 999 })).toThrow();
    expect(() => RunnerJwtClaims.parse({ ...c, aud: "web" })).toThrow();
  });
  it("claim body and outbox rows", () => {
    expect(RunnerClaimBody.parse({})).toEqual({ limit: 5 });
    expect(() => RunnerClaimBody.parse({ limit: 21 })).toThrow();
    const row = { id: 7, kind: "baseline", idempotency_key: "baseline:x", payload: { repo_id: RID }, attempts: 0, lease_until: "2026-11-26T10:00:00.000Z" };
    expect(RunnerOutboxRow.parse(row)).toEqual(row);
    expect(RunnerFailBody.parse({ error: "boom" })).toEqual({ error: "boom" });
    expect(() => RunnerFailBody.parse({ error: "x".repeat(301) })).toThrow();
  });
  it("routes: only /api/runner/<known>; outbox ids are positive integers", () => {
    expect(runnerRoute("POST", "/api/runner/register")).toEqual({ kind: "register" });
    expect(runnerRoute("POST", "/api/runner/token")).toEqual({ kind: "token" });
    expect(runnerRoute("POST", "/api/runner/heartbeat")).toEqual({ kind: "heartbeat" });
    expect(runnerRoute("POST", "/api/runner/outbox/claim")).toEqual({ kind: "claim" });
    expect(runnerRoute("POST", "/api/runner/outbox/12/done")).toEqual({ kind: "done", id: 12 });
    expect(runnerRoute("POST", "/api/runner/outbox/12/failed")).toEqual({ kind: "failed", id: 12 });
    expect(runnerRoute("POST", "/api/runner/outbox/12/extend")).toEqual({ kind: "extend", id: 12 });
    expect(runnerRoute("GET", "/api/runner/heartbeat")).toBeNull();
    expect(runnerRoute("POST", "/api/runner/outbox/0/done")).toBeNull();
    expect(runnerRoute("POST", "/api/runner/outbox/1e3/done")).toBeNull();
    expect(runnerRoute("POST", "/api/runner/../webhooks")).toBeNull();
    expect(runnerRoute("POST", "/api/runner/register?x=1")).toEqual({ kind: "register" });
  });
  it("the kinds a runner may take are effects that need Docker on the runner's machine", () => {
    expect([...RUNNER_KINDS].sort()).toEqual(["baseline", "harness_scan", "mcp_vet"]);
  });
});
