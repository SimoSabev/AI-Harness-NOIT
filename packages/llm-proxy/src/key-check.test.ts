import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkKey, classifyCheck } from "./key-check.js";

// D-472: "Check the key" — one 1-token request in the provider's own format, four plain results. The key goes in the
// provider's header only (never in the URL), and nothing of it comes back in the result.
const KEY = ["sk", "test", randomBytes(18).toString("base64url")].join("-");
type Seen = { url: string; method: string; headers: Record<string, string>; body: string };
function fakeFetch(reply: { status: number; body?: string } | "throw") {
  const seen: Seen[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), method: init?.method ?? "GET", headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: String(init?.body ?? "") });
    if (reply === "throw") throw new TypeError("fetch failed");
    return new Response(reply.body ?? "{}", { status: reply.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, seen };
}

describe("classifyCheck (D-472)", () => {
  it("2xx works; 401/403 refused; 402 no credit", () => {
    expect(classifyCheck(200, "")).toBe("ok");
    expect(classifyCheck(401, "")).toBe("bad_key");
    expect(classifyCheck(403, "")).toBe("bad_key");
    expect(classifyCheck(402, '{"error":{"message":"Insufficient Balance"}}')).toBe("no_credit");
  });
  it("429: no credit when the body says quota/balance/credit, else the key works (only busy)", () => {
    expect(classifyCheck(429, '{"error":{"code":"insufficient_quota"}}')).toBe("no_credit");
    expect(classifyCheck(429, '{"error":{"message":"rate limit"}}')).toBe("ok");
  });
  it("400: a bad key (Gemini's API_KEY_INVALID), a credit message (Anthropic's 'credit balance is too low'), else the key works", () => {
    expect(classifyCheck(400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}')).toBe("bad_key");
    expect(classifyCheck(400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}')).toBe("no_credit");
    expect(classifyCheck(400, '{"error":{"message":"max_tokens: too small"}}')).toBe("ok");
  });
  it("404 about the model: the key works; any other 404 or 5xx: did not answer", () => {
    expect(classifyCheck(404, '{"error":{"message":"model not found: x"}}')).toBe("ok");
    expect(classifyCheck(404, "<html>Not Found</html>")).toBe("unreachable");
    expect(classifyCheck(500, "")).toBe("unreachable");
    expect(classifyCheck(529, "")).toBe("unreachable");
  });
});

describe("checkKey (D-472)", () => {
  it("anthropic: POST /v1/messages, 1 token, x-api-key + anthropic-version", async () => {
    const { f, seen } = fakeFetch({ status: 200 });
    expect(await checkKey(f, { wire: "anthropic", base: "https://api.deepseek.com/anthropic/", auth: "x-api-key", key: KEY, model: "deepseek-v4-pro" })).toBe("ok");
    expect(seen[0]).toMatchObject({ url: "https://api.deepseek.com/anthropic/v1/messages", method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01" } });
    expect(JSON.parse(seen[0]?.body ?? "")).toMatchObject({ model: "deepseek-v4-pro", max_tokens: 1 });
  });
  it("openai (Responses): POST /v1/responses with a bearer; Azure: the api-key header", async () => {
    const a = fakeFetch({ status: 200 });
    await checkKey(a.f, { wire: "openai", base: "https://api.x.ai", auth: "bearer", key: KEY, model: "grok-5" });
    expect(a.seen[0]).toMatchObject({ url: "https://api.x.ai/v1/responses", headers: { authorization: `Bearer ${KEY}` } });
    const z = fakeFetch({ status: 200 });
    await checkKey(z.f, { wire: "openai", base: "https://acme.openai.azure.com/openai", auth: "api-key", key: KEY, model: "gpt-5" });
    expect(z.seen[0]).toMatchObject({ url: "https://acme.openai.azure.com/openai/v1/responses", headers: { "api-key": KEY } });
  });
  it("openai-chat: POST /v1/chat/completions; gemini: generateContent with x-goog-api-key, never ?key=", async () => {
    const c = fakeFetch({ status: 401 });
    expect(await checkKey(c.f, { wire: "openai-chat", base: "https://api.mistral.ai", auth: "bearer", key: KEY, model: "mistral-large" })).toBe("bad_key");
    expect(c.seen[0]?.url).toBe("https://api.mistral.ai/v1/chat/completions");
    const g = fakeFetch({ status: 200 });
    await checkKey(g.f, { wire: "gemini", base: "https://generativelanguage.googleapis.com", auth: "x-goog-api-key", key: KEY, model: "gemini-3.8-flash" });
    expect(g.seen[0]).toMatchObject({ url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", headers: { "x-goog-api-key": KEY } });
    expect(g.seen[0]?.url).not.toContain("key=");
  });
  it("native: the models list (GET /v1/models); a local server without a key gets no auth header", async () => {
    const n = fakeFetch({ status: 200 });
    await checkKey(n.f, { wire: "native", base: "https://api.cohere.com", auth: "bearer", key: KEY, model: "command-a" });
    expect(n.seen[0]).toMatchObject({ url: "https://api.cohere.com/v1/models", method: "GET" });
    const l = fakeFetch({ status: 200 });
    await checkKey(l.f, { wire: "anthropic", base: "http://127.0.0.1:11434", auth: "none", key: "", model: "qwen3-coder" });
    expect(l.seen[0]).toMatchObject({ url: "http://127.0.0.1:11434/v1/models", method: "GET" }); // never loads a model
    expect(Object.keys(l.seen[0]?.headers ?? {}).some((h) => ["authorization", "x-api-key", "api-key", "x-goog-api-key"].includes(h))).toBe(false);
  });
  it("a network error or timeout is 'did not answer'; the key is never in a URL", async () => {
    const t = fakeFetch("throw");
    expect(await checkKey(t.f, { wire: "anthropic", base: "https://api.anthropic.com", auth: "x-api-key", key: KEY, model: "claude-haiku-5-5" })).toBe("unreachable");
    expect(t.seen.every((s) => !s.url.includes(KEY))).toBe(true);
  });
});
