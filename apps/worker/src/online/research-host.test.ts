import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ResearchRequest } from "@mandat/contract";
import { verifyTaskToken } from "@mandat/llm-proxy";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, seedChannels, seedMinimal } from "./seed.js";
import { hostResearchEnv } from "./research-host.js";

// E9г (D-398): every connected model counts — keys through the proxy, subscriptions through their CLI, local servers.
let db: Awaited<ReturnType<typeof pgliteDb>>;
const secretDir = mkdtempSync(path.join(tmpdir(), "mandat-research-"));
const secretPath = path.join(secretDir, "secret");
writeFileSync(secretPath, Buffer.alloc(32, 7));
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
  await seedChannels(db);
  await db.query("insert into public.model_channels (org_id, label, provider, kind, model, quality, cost) values ($1::uuid, 'claude-profile-lichno', 'anthropic', 'cli_profile', 'claude-sonnet-5-5', 0.9, 0.05), ($1::uuid, 'local-qwen', 'openai', 'local', 'qwen3:32b', 0.6, 0)", [DEMO_ORG_ID]);
});
afterAll(() => db.end());

const req = ResearchRequest.parse({ question: "q", depth: "standard", goal: "balanced" });
const env = { MANDAT_SEARXNG_URL: "http://127.0.0.1:9" };

describe("the host research environment (D-398)", () => {
  it("with the proxy and a profile runner: API keys, the subscription and the local model are all channels", async () => {
    const e = await hostResearchEnv({ db, env, proxy: { url: "http://127.0.0.1:1", secretPath }, profileExec: async () => "{}" }, DEMO_ORG_ID, req, "q_host");
    expect(e.channels.map((c) => c.kind).sort()).toEqual(["api_key", "api_key", "cli_profile", "local"]);
    expect(e.providers.map((p) => p.name)).toContain("anthropic-web-search");
    // SearXNG is not running on port 9: it is left out instead of failing every query
    expect(e.providers.map((p) => p.name)).not.toContain("searxng");
    expect(e.providers.map((p) => p.name)).toEqual(expect.arrayContaining(["wikipedia", "arxiv", "github", "stackexchange"]));
  });
  it("without the proxy, API-key channels are left out (the key is only in the proxy); without a runner, so is the subscription", async () => {
    const e = await hostResearchEnv({ db, env, proxy: null, profileExec: null }, DEMO_ORG_ID, req, "q_host2");
    expect(e.channels.map((c) => c.kind)).toEqual(["local"]);
    expect(e.providers.map((p) => p.name)).not.toContain("anthropic-web-search");
  });
  it("the subscription channel runs `claude -p` with no tools through the profile runner", async () => {
    let seen: { profile: string; argv: string[]; stdin: string } | null = null;
    const e = await hostResearchEnv({ db, env, proxy: null, profileExec: async (profile, argv, stdin) => ((seen = { profile, argv, stdin }), JSON.stringify({ result: "ok", usage: {} })) }, DEMO_ORG_ID, req, "q_host3");
    const sub = e.channels.find((c) => c.kind === "cli_profile")!;
    expect((await e.clientOf(sub).complete({ system: "s", user: "u", maxTokens: 10, json: false })).text).toBe("ok");
    expect(seen).toMatchObject({ profile: "lichno", stdin: "u" });
    expect(seen!.argv.slice(0, 6)).toEqual(["claude", "-p", "--output-format", "json", "--tools", ""]);
  });
  it("the mdt_ token of an API-key channel is scoped to this run and its budget", async () => {
    const seenAuth: string[] = [];
    const { createServer } = await import("node:http");
    const s = createServer((rq, rs) => {
      seenAuth.push(String(rq.headers.authorization));
      rs.setHeader("content-type", "application/json");
      rs.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
    });
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const port = (s.address() as { port: number }).port;
    const e = await hostResearchEnv({ db, env, proxy: { url: `http://127.0.0.1:${port}`, secretPath }, profileExec: null }, DEMO_ORG_ID, req, "q_host4");
    const api = e.channels.find((c) => c.label === "anthropic-key-demo")!;
    await e.clientOf(api).complete({ system: "s", user: "u", maxTokens: 10, json: false });
    s.close();
    const tok = seenAuth[0]!.replace(/^Bearer /, "");
    const v = verifyTaskToken(Buffer.alloc(32, 7), tok, Math.floor(Date.now() / 1000));
    expect(v.ok && v.claims).toMatchObject({ t: "q_host4", b: 1 });
  });
});
