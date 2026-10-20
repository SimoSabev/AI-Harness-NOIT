import { startGate } from "./server.js";

// D-111: no env for the npm upstream; always https://registry.npmjs.org.
const gate = await startGate({
  policyDir: process.env.MANDAT_GATE_POLICY_DIR ?? "/etc/mandat-gate",
  logPath: process.env.MANDAT_GATE_LOG ?? "/var/log/mandat-gate/events.jsonl",
  npmCacheDir: process.env.MANDAT_GATE_NPM_CACHE ?? "/var/cache/mandat-npm",
  llmProxyUrl: process.env.MANDAT_LLM_PROXY_URL ?? "http://mandat-llm-proxy:8787",
  httpPort: 80,
  dnsPort: 53,
});
const stop = (): void => {
  void gate.close().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
