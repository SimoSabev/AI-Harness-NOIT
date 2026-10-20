import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GateRouteSchema, MandatError, ulid } from "@mandat/contract";
import { adminBearer, verifyTaskToken } from "@mandat/llm-proxy";
import { apiKeyChannel, channelFor } from "./index.js";

const secret = randomBytes(32);
const secretPath = path.join(mkdtempSync(path.join(tmpdir(), "mandat-ch-")), "secret");
writeFileSync(secretPath, secret);

describe("apiKeyChannel", () => {
  it("gateRoutes = трите маршрута от 6.8", () => {
    const ch = apiKeyChannel({ label: "anthropic-key-main", model: "claude-sonnet-5-5", proxyAdminUrl: "http://127.0.0.1:8788", secretPath });
    const routes = ch.gateRoutes();
    expect(routes).toEqual([
      { id: "llm-messages", method: "POST", match: { kind: "exact", path: "/v1/messages" }, upstream: "llm_proxy" },
      { id: "llm-count", method: "POST", match: { kind: "exact", path: "/v1/messages/count_tokens" }, upstream: "llm_proxy" },
      { id: "hello", method: "HEAD", match: { kind: "exact", path: "/api/hello" }, upstream: "local_ok" },
    ]);
    for (const r of routes) expect(() => GateRouteSchema.parse(r)).not.toThrow();
  });

  it("токен, env, revoke и usage през admin API", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });
      if (String(url).includes("/admin/revoke")) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ usd: 1, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 2, budgetStop: false }), { status: 200 });
    }) as typeof fetch;
    const now = new Date("2026-10-20T10:00:00Z");
    const ch = apiKeyChannel({ label: "anthropic-key-main", model: "claude-sonnet-5-5", proxyAdminUrl: "http://127.0.0.1:8788", secretPath, fetchImpl, now: () => now });
    const runId = "r_" + ulid();
    const c = await ch.issueTaskCredential({ taskId: "t_fix_discount", runId, attempt: 1, budgetUsd: 2, ttlMin: 35 });
    const v = verifyTaskToken(secret, c.token, Math.floor(now.getTime() / 1000));
    expect(v.ok && v.claims).toMatchObject({ t: "t_fix_discount", r: runId, b: 2 });
    expect(c.expiresAt).toBe("2026-10-20T10:35:00.000Z");
    expect(c.tokenHash).toMatch(/^sha256:/);
    expect(ch.sandboxEnv(c)).toEqual({ ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: c.token });
    expect(ch.sandboxEnv(c).ANTHROPIC_API_KEY.startsWith("mdt_")).toBe(true);
    await ch.revokeTaskCredential(runId);
    expect((await ch.usage(runId)).requests).toBe(2);
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(`Bearer ${adminBearer(secret)}`);
    const bad = apiKeyChannel({ label: "anthropic-key-main", model: "claude-sonnet-5-5", proxyAdminUrl: "http://x", secretPath, fetchImpl: (async () => new Response(null, { status: 500 })) as typeof fetch });
    await expect(bad.revokeTaskCredential(runId)).rejects.toThrow(MandatError);
    await expect(bad.usage(runId)).rejects.toThrow(MandatError);
  });

  it("cli_profile → E_CHANNEL_UNSUPPORTED", () => {
    const o = { proxyAdminUrl: "http://x", secretPath };
    expect(() => channelFor({ label: "x", kind: "cli_profile", model: "m" }, o)).toThrow(expect.objectContaining({ code: "E_CHANNEL_UNSUPPORTED" }));
    expect(() => channelFor({ label: "x", kind: "api_key", model: "m" }, o)).toThrow(expect.objectContaining({ code: "E_CHANNEL_UNSUPPORTED" }));
    expect(channelFor({ label: "anthropic-key-main", kind: "api_key", model: "claude-sonnet-5-5" }, o).kind).toBe("api_key");
  });
});
