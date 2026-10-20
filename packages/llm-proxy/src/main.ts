import { readFileSync } from "node:fs";
import { createProxyServer } from "./server.js";

const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
const secretFile = process.env.MANDAT_PROXY_SECRET_FILE ?? "/var/lib/mandat-proxy/secret";
const upstream = process.env.MANDAT_PROXY_UPSTREAM_URL ?? "https://api.anthropic.com";
if (!upstream.startsWith("https://") && process.env.MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM !== "1") {
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
