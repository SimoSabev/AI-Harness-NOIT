// D-117: fake Anthropic upstream for docker tests. ESM, node:http only, no dependencies. Listens on :9000.
import http from "node:http";

const events = [
  ["message_start", { type: "message_start", message: { id: "msg_stub", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }],
  ["message_stop", { type: "message_stop" }],
];

http
  .createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    req.resume();
    if (req.method === "POST" && path === "/v1/messages") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const [name, data] of events) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(Number(process.env.STUB_PORT ?? 9000), "0.0.0.0");
