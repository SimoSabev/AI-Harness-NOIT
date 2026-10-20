import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID } from "../../../../worker/src/online/seed";
import { subscribePush } from "./push";
import { U, webDb } from "./web-db.test-helper";

// т. 8.4: POST /api/push/subscribe — the SSRF check on write; outside the allowlist → 400.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => (db = await webDb()));
afterAll(async () => db.end());
const keys = { p256dh: "BPub", auth: "a" };

describe("push subscribe", () => {
  it("извън allowlist → 400; allowlist + публичен IP → 201 (един ред на endpoint)", async () => {
    const bad = await subscribePush(db, { uid: U.viewer, org: DEMO_ORG_ID, body: { endpoint: "https://evil.example/x", keys } });
    expect(bad).toEqual({ status: 400, body: { error: "endpoint_host" } });
    const priv = await subscribePush(db, { uid: U.viewer, org: DEMO_ORG_ID, body: { endpoint: "http://169.254.169.254/x", keys } });
    expect(priv.status).toBe(400);
    const check = (raw: string) => Promise.resolve({ ok: true as const, url: new URL(raw), address: "142.250.180.10" });
    const body = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys };
    expect((await subscribePush(db, { uid: U.viewer, org: DEMO_ORG_ID, body, check })).status).toBe(201);
    expect((await subscribePush(db, { uid: U.viewer, org: DEMO_ORG_ID, body, check })).status).toBe(201);
    expect((await db.query("select 1 from public.push_subscriptions")).rows).toHaveLength(1);
    expect((await subscribePush(db, { uid: "e0000000-0000-4000-8000-000000000009", org: DEMO_ORG_ID, body, check })).status).toBe(403);
  });
});
