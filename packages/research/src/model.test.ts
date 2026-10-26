import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { RoleModels, cliArgv, cliModel, fakeModel, localModel, parseJsonLoose, proxyModel } from "./model.js";
import type { CallRecord } from "./model.js";
import type { RouterChannel } from "./router.js";

const ch = (id: string, kind: RouterChannel["kind"], model = "m"): RouterChannel => ({ id, label: id, kind, model, enabled: true, health: "ok", quality: 0.8, cost: 0.5 });

let base = "";
const seen: { path: string; headers: Record<string, unknown>; body: Record<string, unknown> }[] = [];
const server = createServer((req, res) => {
  let b = "";
  req.on("data", (c: Buffer) => (b += c.toString()));
  req.on("end", () => {
    const body = JSON.parse(b) as Record<string, unknown>;
    seen.push({ path: req.url ?? "", headers: req.headers, body });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/messages") res.end(JSON.stringify({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000 } }));
    else if (req.url === "/v1/responses") res.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "{\"a\":1}" }] }], usage: { input_tokens: 50, output_tokens: 5, input_tokens_details: { cached_tokens: 0 } } }));
    else if (req.url === "/v1/chat/completions") res.end(JSON.stringify({ choices: [{ message: { content: "local" } }], usage: { prompt_tokens: 7, completion_tokens: 2 } }));
    else {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: { message: "echo of the secret prompt" } }));
    }
  });
});
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("model clients (D-393)", () => {
  it("anthropic through the proxy: the mdt_ token, a cached system prompt, cost from the price table", async () => {
    const m = proxyModel({ channel: ch("s", "api_key", "claude-haiku-5-5"), baseUrl: base, token: "mdt_test", provider: "anthropic" });
    const r = await m.complete({ system: "sys", user: "u", maxTokens: 50, json: false });
    expect(r.text).toBe("hi");
    expect(r.inputTokens).toBe(3000);
    expect(r.usd).toBeGreaterThan(0);
    const last = seen.at(-1)!;
    expect(last.headers["x-api-key"]).toBe("mdt_test");
    expect(JSON.stringify(last.body.system)).toContain("ephemeral");
  });
  it("openai responses through the proxy asks for a JSON object when json is set", async () => {
    const m = proxyModel({ channel: ch("o", "api_key", "gpt-x"), baseUrl: base, token: "mdt_o", provider: "openai", openaiPrices: { "gpt-x": { input: 1, cached_input: 0.1, output: 2 } } });
    const r = await m.complete({ system: "sys", user: "u", maxTokens: 50, json: true });
    expect(r.text).toBe('{"a":1}');
    expect(seen.at(-1)!.body.text).toEqual({ format: { type: "json_object" } });
    expect(r.usd).toBeCloseTo(0.00006, 8);
  });
  it("a local OpenAI-compatible endpoint costs nothing", async () => {
    const r = await localModel({ channel: ch("l", "local", "qwen3"), baseUrl: `${base}/v1/` }).complete({ system: "s", user: "u", maxTokens: 10, json: false });
    expect(r).toEqual({ text: "local", inputTokens: 7, outputTokens: 2, usd: 0 });
  });
  it("an error never carries the endpoint's body (it may echo the prompt)", async () => {
    const m = localModel({ channel: ch("l", "local"), baseUrl: `${base}/broken` });
    await expect(m.complete({ system: "s", user: "u", maxTokens: 10, json: false })).rejects.toThrow(/answered 500$/);
  });
  it("a subscription: the unchanged CLI with no tools; the prompt on stdin; no $ spent", async () => {
    expect(cliArgv("claude-sonnet-5-5", "sys")).toEqual(["claude", "-p", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--model", "claude-sonnet-5-5", "--system-prompt", "sys"]);
    let stdin = "";
    const m = cliModel({ channel: ch("max", "cli_profile"), exec: async (_argv, s) => ((stdin = s), JSON.stringify({ type: "result", is_error: false, result: "ok", total_cost_usd: 0.3, usage: { input_tokens: 10, output_tokens: 3 } })) });
    expect(await m.complete({ system: "s", user: "the question", maxTokens: 10, json: false })).toEqual({ text: "ok", inputTokens: 10, outputTokens: 3, usd: 0 });
    expect(stdin).toBe("the question");
    const bad = cliModel({ channel: ch("max", "cli_profile"), exec: async () => JSON.stringify({ is_error: true, subtype: "error_max_turns" }) });
    await expect(bad.complete({ system: "s", user: "u", maxTokens: 1, json: false })).rejects.toThrow(/error_max_turns/);
  });
});

describe("role models with fallbacks", () => {
  const a = ch("a", "api_key");
  const b = ch("b", "local");
  it("the primary fails → the fallback answers; both attempts are reported", async () => {
    const calls: CallRecord[] = [];
    const clients = new Map([
      ["a", { channel: a, complete: async () => Promise.reject(new Error("429")) }],
      ["b", fakeModel(b, () => "from b")],
    ]);
    const rm = new RoleModels([{ role: "reader", channels: [a, b], fixed: false }], (c) => clients.get(c.id)!, (c) => calls.push(c));
    expect((await rm.text("reader", "read", { system: "s", user: "u", maxTokens: 1, json: false })).text).toBe("from b");
    expect(calls.map((c) => [c.channel.id, c.reply === null])).toEqual([["a", true], ["b", false]]);
    expect(rm.assignments()).toEqual([{ role: "reader", channel: "a", channel_kind: "api_key", model: "m" }]);
  });
  it("json: a fenced answer parses; a wrong shape gets one repair round", async () => {
    let n = 0;
    const rm = new RoleModels([{ role: "planner", channels: [a], fixed: false }], () => fakeModel(a, () => (n++ === 0 ? '{"lanes": 3}' : '```json\n{"lanes": ["x"]}\n```')), () => {});
    const out = await rm.json("planner", "plan", z.object({ lanes: z.array(z.string()) }), { system: "s", user: "u", maxTokens: 10 });
    expect(out.lanes).toEqual(["x"]);
    expect(n).toBe(2);
  });
  it("every model down → an error naming the role", async () => {
    const rm = new RoleModels([{ role: "writer", channels: [a], fixed: false }], () => ({ channel: a, complete: async () => Promise.reject(new Error("x")) }), () => {});
    await expect(rm.text("writer", "w", { system: "s", user: "u", maxTokens: 1, json: false })).rejects.toThrow(/writer/);
  });
  it("parseJsonLoose finds the JSON inside prose", () => {
    expect(parseJsonLoose('Sure! {"a": [1]} hope it helps')).toEqual({ a: [1] });
    expect(parseJsonLoose("no json")).toBeUndefined();
  });
});
