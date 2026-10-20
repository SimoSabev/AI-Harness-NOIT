import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_CHANNELS } from "../../../../worker/src/online/seed";
import { getChannels, postSwitchChannel } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import { U, webDb } from "./web-db.test-helper";

// Демо промпт т. 8.3: channels-no-secrets + the manual switch (fallback-validation: same-provider profile → 403).
let db: Awaited<ReturnType<typeof webDb>>;
let who = U.approver;
const csrf = "c".repeat(43);
const deps = (): ApiDeps => ({ db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(10, 60_000) });
const post = (p: string, body: unknown) => new Request(`http://localhost:3000${p}`, { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, "x-mandat-csrf": csrf }, body: JSON.stringify(body) });
beforeAll(async () => (db = await webDb()));
afterAll(async () => db.end());

describe("channels-no-secrets", () => {
  it("GET /api/channels: само метаданни; никакъв ключ/токен/тайна", async () => {
    // a real-looking key in the proxy env must never surface; the table has no column for it at all
    process.env.OPENAI_API_KEY = ["sk", "proj", "x".repeat(20)].join("-");
    const r = await getChannels(new Request("http://localhost:3000/api/channels"), deps());
    const text = await r.text();
    delete process.env.OPENAI_API_KEY;
    const body = JSON.parse(text) as { channels: Record<string, unknown>[] };
    expect(body.channels.map((c) => c.label)).toEqual(["anthropic-key-demo", "openai-key-demo"]);
    for (const c of body.channels) expect(Object.keys(c).sort()).toEqual(["budget_usd_day", "cooldown_until", "enabled", "health", "id", "kind", "label", "last_error", "limit_resets_at", "model", "provider", "spent_today_usd"]);
    expect(text).not.toMatch(/sk-|mdt_|secret|api_key"\s*:\s*"[^"]{8,}|token/i);
  });
  it("ръчна смяна: viewer → 403; не HELD → 409; HELD → нов опит на другия доставчик + ledger channel_manual_switch", async () => {
    await db.query("update public.tasks set channel_id = $1, agent = 'fake:honest-fix' where id = 't_seed_bugfix'", [DEMO_CHANNELS.anthropic]);
    who = U.viewer;
    expect((await postSwitchChannel(post("/api/tasks/t_seed_bugfix/switch-channel", { channel_id: DEMO_CHANNELS.openai }), deps(), "t_seed_bugfix")).status).toBe(403);
    who = U.approver;
    expect((await postSwitchChannel(post("/api/tasks/t_seed_docs/switch-channel", { channel_id: DEMO_CHANNELS.openai }), deps(), "t_seed_docs")).status).toBe(409);
    const r = await postSwitchChannel(post("/api/tasks/t_seed_bugfix/switch-channel", { channel_id: DEMO_CHANNELS.openai }), deps(), "t_seed_bugfix");
    expect([r.status, await r.json()]).toEqual([200, { channel: "openai-key-demo", agent: "fake-codex:honest-fix", attempt: 2 }]);
    expect((await db.query("select 1 from public.ledger where kind = 'channel_manual_switch'")).rows).toHaveLength(1);
  });
  it("ръчна смяна към cli_profile на същия доставчик → 403", async () => {
    await db.query("insert into public.model_channels (id, org_id, label, provider, kind, model) values ('d0000000-0000-4000-8000-0000000000c9', 'd0000000-0000-4000-8000-000000000001', 'claude-sub-b', 'anthropic', 'cli_profile', 'claude-sonnet-5-5')");
    await db.query("update public.tasks set state = 'HELD', channel_id = $1 where id = 't_seed_feature'", [DEMO_CHANNELS.anthropic]);
    const r = await postSwitchChannel(post("/api/tasks/t_seed_feature/switch-channel", { channel_id: "d0000000-0000-4000-8000-0000000000c9" }), deps(), "t_seed_feature");
    expect([r.status, await r.json()]).toEqual([403, { error: "same_provider_profile" }]);
  });
});
