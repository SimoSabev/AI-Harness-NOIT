import { describe, expect, it } from "vitest";
import http from "node:http";
import type net from "node:net";
import webpush from "web-push";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { checkPushEndpoint, isPrivateIp, pushPayload, sendWebPush, webPushHandler } from "./push.js";

const pub = () => Promise.resolve(["142.250.180.10"]);

describe("push-ssrf (S18)", () => {
  it("отказ: http/127.0.0.1, метаданни 169.254.169.254, чужд хост, порт ≠ 443, allowlist хост към 10.0.0.1", async () => {
    expect(await checkPushEndpoint("http://127.0.0.1:8790/x", { resolve: pub, env: {} })).toEqual({ ok: false, reason: "scheme" });
    expect(await checkPushEndpoint("http://169.254.169.254/latest/meta-data", { resolve: pub, env: {} })).toEqual({ ok: false, reason: "scheme" });
    expect(await checkPushEndpoint("https://evil.example/push", { resolve: pub, env: {} })).toEqual({ ok: false, reason: "host" });
    expect(await checkPushEndpoint("https://fcm.googleapis.com.evil.example/x", { resolve: pub, env: {} })).toEqual({ ok: false, reason: "host" });
    expect(await checkPushEndpoint("https://fcm.googleapis.com:8443/x", { resolve: pub, env: {} })).toEqual({ ok: false, reason: "port" });
    expect(await checkPushEndpoint("https://u:p@fcm.googleapis.com/x", { resolve: pub, env: {} })).toEqual({ ok: false, reason: "host" });
    expect(await checkPushEndpoint("https://fcm.googleapis.com/fcm/send/x", { resolve: () => Promise.resolve(["10.0.0.1"]), env: {} })).toEqual({ ok: false, reason: "private_ip" });
    expect(await checkPushEndpoint("https://web.push.apple.com/x", { resolve: () => Promise.resolve(["17.1.1.1", "::1"]), env: {} })).toEqual({ ok: false, reason: "private_ip" });
    expect(await checkPushEndpoint("https://fcm.googleapis.com/x", { resolve: () => Promise.reject(new Error("nx")), env: {} })).toEqual({ ok: false, reason: "dns" });
    expect(await checkPushEndpoint("not a url", { env: {} })).toEqual({ ok: false, reason: "bad_url" });
  });
  it("приема хост от allowlist с публичен IP", async () => {
    const r = await checkPushEndpoint("https://fcm.googleapis.com/fcm/send/abc", { resolve: pub, env: {} });
    expect(r.ok && r.address).toBe("142.250.180.10");
    expect((await checkPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x", { resolve: pub, env: {} })).ok).toBe(true);
  });
  it("MANDAT_PUSH_TEST_ENDPOINT само при NODE_ENV=test", async () => {
    const env = { MANDAT_PUSH_TEST_ENDPOINT: "http://127.0.0.1:8790/" };
    expect(await checkPushEndpoint("http://127.0.0.1:8790/sub1", { env })).toEqual({ ok: false, reason: "test_endpoint" });
    expect((await checkPushEndpoint("http://127.0.0.1:8790/sub1", { env: { ...env, NODE_ENV: "test" } })).ok).toBe(true);
  });
  it("частни адреси", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254", "::1", "fc00::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) expect([ip, isPrivateIp(ip)]).toEqual([ip, true]);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2a00:1450:4001::1"]) expect([ip, isPrivateIp(ip)]).toEqual([ip, false]);
  });
});

describe("push-payload", () => {
  it("заглавие ≤ 80 знака, без тайни; само полетата на Ф4", () => {
    const p = JSON.parse(pushPayload({ task_id: "t_x", kind: "waiting", text: "Поправи ".repeat(30), result: "VERIFIED", level: 1 })) as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(["kind", "level", "task_id", "title", "verdict"]);
    expect([...(p.title as string)].length).toBeLessThanOrEqual(80);
    expect(p.verdict).toBe("ПРОВЕРЕНО");
    const f = pushPayload({ task_id: "t_y", kind: "failed", text: "x", result: "FAILED", level: 0 });
    expect(f).toBe(JSON.stringify({ task_id: "t_y", kind: "failed", title: "ПРОВАЛ: x", verdict: "ПРОВАЛ", level: 0 }));
    expect(f).not.toMatch(/mdt_|sk-|token|secret/i);
  });
});

describe("push-send (локален фалшив push endpoint)", () => {
  it("outbox web_push → 1 POST с криптирано тяло и VAPID; 410 → абонаментът се трие; редирект → отказ; без VAPID → SKIPPED", async () => {
    const seen: { url: string; headers: http.IncomingHttpHeaders; bytes: number }[] = [];
    let status = 201;
    const srv = http.createServer((req, res) => {
      let n = 0;
      req.on("data", (c: Buffer) => (n += c.length));
      req.on("end", () => {
        seen.push({ url: req.url ?? "", headers: req.headers, bytes: n });
        res.writeHead(status, status === 302 ? { location: "http://169.254.169.254/" } : {});
        res.end();
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}/`;
    const env = { NODE_ENV: "test", MANDAT_PUSH_TEST_ENDPOINT: base, ...(() => { const k = webpush.generateVAPIDKeys(); return { VAPID_SUBJECT: "mailto:demo@mandat.invalid", VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey }; })() };
    // a browser-side key pair for the subscription (P-256), as a real PushSubscription would have
    const { createECDH, randomBytes } = await import("node:crypto");
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const sub = { endpoint: `${base}sub1`, p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
    const db = await pgliteDb();
    try {
      await seedMinimal(db, { remoteUrl: "file:///x" });
      await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, last_result, effective_level) values ('t_push', $1, $2, 'bugfix', 'claude', 'Поправи отстъпката', 'FAILED', 0)", [DEMO_ORG_ID, DEMO_REPO_ID]);
      await db.query("insert into public.push_subscriptions (org_id, user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)", [DEMO_ORG_ID, DEMO_OWNER_ID, sub.endpoint, sub.p256dh, sub.auth]);
      const logs: string[] = [];
      await webPushHandler({ db, env, log: (l) => logs.push(l) })({ payload: { task_id: "t_push", kind: "failed" } });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.url).toBe("/sub1");
      expect(seen[0]?.headers["content-encoding"]).toBe("aes128gcm");
      expect(String(seen[0]?.headers.authorization)).toMatch(/^vapid t=/);
      expect(seen[0]?.bytes).toBeGreaterThan(0);
      expect(logs).toEqual(["[push] t_push failed → 201"]);
      status = 302;
      expect(await sendWebPush({ id: "x", ...sub }, "{}", { vapid: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }, env })).toEqual({ ok: false, status: 302, reason: "redirect_refused", gone: false });
      expect(seen).toHaveLength(2); // the redirect target was never requested
      status = 410;
      await webPushHandler({ db, env })({ payload: { task_id: "t_push", kind: "failed" } });
      expect((await db.query("select 1 from public.push_subscriptions")).rows).toHaveLength(0);
      const skipped: string[] = [];
      await webPushHandler({ db, env: {}, log: (l) => skipped.push(l) })({ payload: { task_id: "t_push", kind: "failed" } });
      expect(skipped).toEqual(["[push] SKIPPED: VAPID keys are not set (docs/setup/push.md)"]);
      await expect(webPushHandler({ db, env })({ payload: { task_id: "x", kind: "failed" } })).rejects.toThrow();
    } finally {
      await db.end();
      srv.close();
    }
  });
});
