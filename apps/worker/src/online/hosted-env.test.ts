import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { hostedFromEnv, workerRole } from "./hosted-env.js";
import { startHostedServer } from "./hosted-server.js";

// E10 hosted (D-700): what `mandat worker` serves on its port, from env only (MANDAT_HOSTED=1).
const A = "a0000000-0000-4000-8000-00000000000a";
let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await db.query(`insert into public.orgs (id, name) values ('${A}', 'team-a')`);
  await db.query(`insert into public.repos (id, org_id, provider, full_name, remote_url) values ('a2000000-0000-4000-8000-000000000001', '${A}', 'github', 'team-a/shop', 'https://github.com/team-a/shop')`);
}, 60_000);
afterAll(async () => {
  await db.end?.();
});

describe("hostedFromEnv (D-700)", () => {
  it("off without MANDAT_HOSTED=1; the runner routes need a ≥ 32 character JWT secret", () => {
    expect(hostedFromEnv({}, db, () => "")).toBeNull();
    const logs: string[] = [];
    const h = hostedFromEnv({ MANDAT_HOSTED: "1", MANDAT_RUNNER_JWT_SECRET: "short" }, db, () => "", (l) => logs.push(l));
    expect(h?.runner).toBeUndefined();
    expect(logs.join("\n")).toContain("runner protocol off");
    expect(logs.join("\n")).not.toContain("short");
    expect(hostedFromEnv({ MANDAT_HOSTED: "1", MANDAT_RUNNER_JWT_SECRET: "s".repeat(32) }, db, () => "")?.runner).toBeTypeOf("function");
  });
  it("worker role: all (default) or api (only the HTTP port)", () => {
    expect(workerRole({})).toBe("all");
    expect(workerRole({ MANDAT_WORKER_ROLE: "api" })).toBe("api");
    expect(() => workerRole({ MANDAT_WORKER_ROLE: "x" })).toThrow(/MANDAT_WORKER_ROLE/);
  });
  it("a signed GitHub webhook of a known repo is stored once (sync_events); an unknown repo is accepted, not stored", async () => {
    const secret = "w".repeat(32);
    const h = hostedFromEnv({ MANDAT_HOSTED: "1", GITHUB_WRITER_WEBHOOK_SECRET: secret }, db, () => "");
    expect(h?.webhook).toBeTypeOf("function");
    const s = await startHostedServer(h ?? {}, { host: "127.0.0.1", port: 0 });
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/webhooks/github/writer`;
    const send = (delivery: string, payload: unknown) => {
      const body = JSON.stringify(payload);
      return fetch(url, { method: "POST", body, headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`, "x-github-delivery": delivery, "x-github-event": "push" } });
    };
    expect((await send("11111111-aaaa", { repository: { full_name: "team-a/shop" } })).status).toBe(202);
    expect((await send("11111111-aaaa", { repository: { full_name: "team-a/shop" } })).status).toBe(200);
    expect((await send("22222222-bbbb", { repository: { full_name: "someone/else" } })).status).toBe(202);
    await new Promise((r) => s.close(r));
    const rows = (await db.query<{ org_id: string; delivery_id: string; event: string }>("select org_id::text as org_id, delivery_id, event from public.sync_events")).rows;
    expect(rows).toEqual([{ org_id: A, delivery_id: "11111111-aaaa", event: "push" }]);
  });
});
