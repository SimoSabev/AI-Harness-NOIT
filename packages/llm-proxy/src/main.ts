import { readFileSync } from "node:fs";
import type { OpenAiRate } from "./pricing.js";
import { createProxyServer } from "./server.js";

const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
const secretFile = process.env.MANDAT_PROXY_SECRET_FILE ?? "/var/lib/mandat-proxy/secret";
// S33 (т. 8.3): one upstream per provider; MANDAT_PROXY_UPSTREAM_URL stays as the E0 name for Anthropic.
const upstream = process.env.MANDAT_UPSTREAM_ANTHROPIC ?? process.env.MANDAT_PROXY_UPSTREAM_URL ?? "https://api.anthropic.com";
const openaiUpstream = process.env.MANDAT_UPSTREAM_OPENAI ?? "https://api.openai.com";
const openaiKey = process.env.OPENAI_API_KEY ?? "";
let prices: Record<string, OpenAiRate> = {};
try {
  prices = JSON.parse(process.env.MANDAT_PROXY_OPENAI_PRICES ?? "{}") as Record<string, OpenAiRate>;
} catch {
  process.stderr.write("mandat-llm-proxy: MANDAT_PROXY_OPENAI_PRICES is not JSON; OpenAI models are not allowed\n");
}
if ((!upstream.startsWith("https://") || !openaiUpstream.startsWith("https://")) && process.env.MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM !== "1") {
  process.stderr.write("mandat-llm-proxy: a non-https upstream needs MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM=1\n");
  process.exit(2);
}
if (apiKey === "" && process.env.MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM !== "1") {
  process.stderr.write("mandat-llm-proxy: ANTHROPIC_API_KEY is missing\n");
  process.exit(2);
}
const secret = readFileSync(secretFile);
const { inference, admin } = createProxyServer({
  secret,
  apiKey,
  upstream,
  ...(openaiKey !== "" || process.env.MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM === "1" ? { openai: { apiKey: openaiKey, upstream: openaiUpstream, prices } } : {}),
  usageLogPath: process.env.MANDAT_PROXY_USAGE_LOG ?? "/var/lib/mandat-proxy/usage.jsonl",
});
inference.listen(8787, "0.0.0.0");
admin.listen(8788, "0.0.0.0");
const stop = (): void => {
  inference.close();
  admin.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
