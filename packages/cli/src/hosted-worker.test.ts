import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { pgliteDb } from "../../../apps/worker/src/online/pglite-db.test-helper.js";
import { serveHosted } from "./commands/worker.js";

// E10 hosted (D-700): `mandat worker` with MANDAT_HOSTED=1 opens its port (behind Caddy); without it, nothing listens.
describe("serveHosted (D-700)", () => {
  it("MANDAT_HOSTED=1 → /healthz and /api/runner/*; no secret value in the log; without it → null", async () => {
    const db = await pgliteDb();
    let err = "";
    const io = { stdout: () => undefined, stderr: (s: string) => (err += s), env: {}, cwd: process.cwd() };
    expect(await serveHosted(io, { db, env: {} })).toBeNull();
    const secret = "q".repeat(40);
    const s = await serveHosted(io, { db, env: { MANDAT_HOSTED: "1", MANDAT_WEBHOOK_HOST: "127.0.0.1", MANDAT_WEBHOOK_PORT: "0", MANDAT_RUNNER_JWT_SECRET: secret } });
    const base = `http://127.0.0.1:${(s?.address() as AddressInfo).port}`;
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/api/runner/heartbeat`, { method: "POST" })).status).toBe(401);
    await new Promise((r) => s?.close(r));
    await db.end?.();
    expect(err).toContain("runner protocol on");
    expect(err).not.toContain(secret);
  }, 60_000);
});
