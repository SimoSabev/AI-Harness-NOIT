import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { devLogin, readSession, sessionSecret, signSession } from "./session";
import { TEST_PASSWORD, U, webDb } from "./web-db.test-helper";

describe("dev session (D-285)", () => {
  const secret = "s".repeat(40);
  it("подпис, изтичане, подправяне", () => {
    const c = signSession(U.approver, secret, 1000);
    expect(readSession(c, secret, 1001)).toBe(U.approver);
    expect(readSession(c, secret, 1000 + 9 * 3600)).toBeNull();
    expect(readSession(c, "x".repeat(40), 1001)).toBeNull();
    expect(readSession(`${c}x`, secret, 1001)).toBeNull();
    expect(readSession("a.b.c", secret, 1001)).toBeNull();
    expect(readSession(undefined, secret)).toBeNull();
  });
  it("тайна: от env (≥ 32) или случайна за процеса", () => {
    expect(sessionSecret({ MANDAT_WEB_SESSION_SECRET: secret })).toBe(secret);
    const a = sessionSecret({ MANDAT_WEB_SESSION_SECRET: "short" });
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(sessionSecret({})).toBe(a);
    // a second copy of the module (another Next bundle) sees the same per-process secret
    expect((globalThis as Record<symbol, unknown>)[Symbol.for("mandat.web.sessionSecret")]).toBe(a);
  });
  describe("вход срещу auth.users", () => {
    let db: Awaited<ReturnType<typeof webDb>>;
    beforeAll(async () => (db = await webDb()));
    afterAll(async () => db.end());
    it("вярна парола → id; грешна → null", async () => {
      expect(await devLogin(db, "APPROVER@demo.mandat.invalid", TEST_PASSWORD)).toBe(U.approver);
      expect(await devLogin(db, "approver@demo.mandat.invalid", "wrong")).toBeNull();
      expect(await devLogin(db, "approver@demo.mandat.invalid", "")).toBeNull();
    });
  });
});
