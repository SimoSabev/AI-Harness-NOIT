// D-117 / E3в: fake upstream for docker tests and offline demos. ESM, node:http only, no dependencies. Listens on :9000.
//   default: Anthropic /v1/messages SSE · /v1/responses: the recorded Responses SSE (openai mode, synthetic until S-CX)
//   --429 <seconds>: Anthropic answers 429 with retry-after <seconds> and a reset header (scene 2: the limit is simulated)
import http from "node:http";

const args = process.argv.slice(2);
const i429 = args.indexOf("--429");
const limitS = i429 >= 0 ? Number(args[i429 + 1] ?? "7200") : null;

const events = [
  ["message_start", { type: "message_start", message: { id: "msg_stub", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }],
  ["message_stop", { type: "message_stop" }],
];
const responses = [
  ["response.created", { type: "response.created", response: { id: "resp_stub", object: "response", status: "in_progress", model: "gpt-5-codex", usage: null } }],
  ["response.completed", { type: "response.completed", response: { id: "resp_stub", object: "response", status: "completed", model: "gpt-5-codex", usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 200, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1200 } } }],
];

http
  .createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    req.resume();
    if (req.method === "POST" && path === "/v1/messages") {
      if (limitS !== null) {
        const reset = new Date(Date.now() + limitS * 1000).toISOString();
        res.writeHead(429, { "content-type": "application/json", "retry-after": String(limitS), "anthropic-ratelimit-requests-reset": reset });
        res.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "stub: limit simulated" } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const [name, data] of events) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      res.end();
      return;
    }
    if (req.method === "POST" && path === "/v1/responses") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const [name, data] of responses) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(Number(process.env.STUB_PORT ?? 9000), "0.0.0.0");
