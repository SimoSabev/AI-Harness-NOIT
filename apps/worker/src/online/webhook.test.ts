import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { startWebhookServer } from "./webhook.js";

// т. 6.5: signature, dedupe by X-GitHub-Delivery, 401 + security event on a bad signature.
const SECRET = "test-secret-not-real";
const seen = new Set<string>();
const events: string[] = [];
const server = await startWebhookServer(
  {
    secrets: { observer: SECRET, writer: null },
    record: (e) => {
      const fresh = !seen.has(e.delivery);
      seen.add(e.delivery);
      return Promise.resolve(fresh);
    },
    security: (k) => void events.push(k),
    maxBytes: 1024,
  },
  { host: "127.0.0.1", port: 0 },
);
afterAll(() => new Promise<void>((r) => server.close(() => r())));
const url = (p: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${p}`;
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const post = (p: string, body: string, h: Record<string, string>) => fetch(url(p), { method: "POST", body, headers: { "content-type": "application/json", ...h } });

describe("webhook (т. 6.5)", () => {
  it("валиден подпис → 202; повторен delivery id → 200 и игнориран", async () => {
    const body = JSON.stringify({ action: "opened", number: 1 });
    const h = { "x-hub-signature-256": sign(body), "x-github-delivery": "11111111-2222-3333-4444-555555555555", "x-github-event": "pull_request" };
    expect((await post("/api/webhooks/github/observer", body, h)).status).toBe(202);
    expect((await post("/api/webhooks/github/observer", body, h)).status).toBe(200);
  });
  it("невалиден подпис → 401 + security_event; writer без secret → 503; лош път → 404; голямо тяло → 413", async () => {
    const body = "{}";
    const r = await post("/api/webhooks/github/observer", body, { "x-hub-signature-256": sign(body, "wrong"), "x-github-delivery": "abcdabcd-0000", "x-github-event": "push" });
    expect(r.status).toBe(401);
    expect(events).toEqual(["webhook_bad_signature"]);
    expect((await post("/api/webhooks/github/observer", body, { "x-github-delivery": "abcdabcd-0001", "x-github-event": "push" })).status).toBe(401);
    expect((await post("/api/webhooks/github/writer", body, { "x-hub-signature-256": sign(body) })).status).toBe(503);
    expect((await post("/api/webhooks/github/other", body, {})).status).toBe(404);
    const big = JSON.stringify({ x: "y".repeat(2000) });
    expect((await post("/api/webhooks/github/observer", big, { "x-hub-signature-256": sign(big) })).status).toBe(413);
    const ok = "{}";
    expect((await post("/api/webhooks/github/observer", ok, { "x-hub-signature-256": sign(ok), "x-github-delivery": "bad delivery!", "x-github-event": "push" })).status).toBe(400);
  });
});
