import { mkdtempSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Verdict } from "@mandat/contract";
import { fakeGitHub } from "@mandat/gate-github";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { runDaemonOnce } from "./daemon.js";
import { drainHarnessOutbox } from "./harness.js";
import { offlineDb } from "./offline-db.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedDemo } from "./seed.js";

// Демо промпт т. 9.6 demo-offline-no-egress: in offline mode the worker's own code never connects outside
// localhost (fetch and every TCP connect are guarded). The sandbox egress is the gate's business (gate tests).
const attempts: string[] = [];
const realConnect = net.Socket.prototype.connect;
const realFetch = globalThis.fetch;
const local = (h: string | undefined) => h === undefined || h === "localhost" || h === "127.0.0.1" || h === "::1" || h.startsWith("/");

beforeAll(() => {
  net.Socket.prototype.connect = function (this: net.Socket, ...a: unknown[]) {
    const o = a[0] as { host?: string; path?: string } | number | string;
    const host = typeof o === "object" && o !== null ? (o.path ?? o.host) : typeof a[1] === "string" ? a[1] : typeof o === "string" ? o : "localhost";
    if (!local(host)) {
      attempts.push(`tcp ${host}`);
      throw new Error(`egress refused: ${host}`);
    }
    return (realConnect as (...x: unknown[]) => net.Socket).apply(this, a);
  } as typeof net.Socket.prototype.connect;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (!local(u.hostname)) {
      attempts.push(`fetch ${u.hostname}`);
      return Promise.reject(new Error(`egress refused: ${u.hostname}`));
    }
    return realFetch(input, init);
  }) as typeof fetch;
});
afterAll(() => {
  net.Socket.prototype.connect = realConnect;
  globalThis.fetch = realFetch;
});

describe("demo-offline-no-egress", () => {
  it("seed + задача (replay) + доставка във fakeGitHub + outbox (approval, push без VAPID) → 0 опита за връзка навън", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-noegress-"));
    const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
    const db = await offlineDb(repoRoot);
    try {
      await seedDemo(db, { remoteUrl: `file://${fx.mirror}`, password: () => "x", totpSecret: () => "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" });
      await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, replay) values ('t_off', $1, $2, 'bugfix', 'fake:replay-claude', 'Поправи отстъпката', 'scene1-task1')", [DEMO_ORG_ID, DEMO_REPO_ID]);
      const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
      const v = Verdict.parse({
        run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: "t_off", attempt: 1, agent: "fake:replay-claude", result: "FAILED", reasons: ["D1:regression:x"],
        evidence: [{ detector: "D1.base_tests", phase: 1, status: "fail", summary: "x", data: {}, source: "sandbox:verify", agent_visible: true }],
        contract_hash: `sha256:${"a".repeat(64)}`, base_sha: fx.sha, tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
        usage: { usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-10-20T00:00:00.000Z",
      });
      await runDaemonOnce({ db, home, gh, ghRepo: "mandat-demo/shop", run: () => Promise.resolve({ verdict: v, exit: 20, runDir: null, ledger: null, agentExit: 0 }) });
      const fxs = await drainHarnessOutbox({ db, gh, ghRepo: "mandat-demo/shop", env: {} });
      expect(fxs.failed).toBe(0);
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.outbox where kind = 'web_push' and status = 'done'")).rows[0]?.n).toBe(1);
      expect(attempts).toEqual([]);
      // the guard itself works
      await expect(fetch("https://api.anthropic.com/v1/messages")).rejects.toThrow(/egress refused/);
      expect(attempts).toEqual(["fetch api.anthropic.com"]);
    } finally {
      await db.end();
    }
  });
});
