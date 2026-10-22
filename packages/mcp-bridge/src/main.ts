#!/usr/bin/env node
import { startBridge } from "./bridge.js";
import { SidecarSpec, serverEnv } from "./spec.js";

// E8e (D-354): `mandat-mcp-bridge` in the sidecar container. `--vet`: start the server, print the vetting (hash, findings,
// per-tool hashes) as one JSON line and exit (no network, at approval). Otherwise serve /mcp on :8080; the worker reads
// GET /status from inside the container (the sandbox has no log driver) → a block is security_event mcp_definition_changed.
const spec = SidecarSpec.parse(JSON.parse(process.env.MANDAT_MCP_SPEC ?? "null"));
const vet = process.argv.includes("--vet");
const out = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");
const b = await startBridge({
  command: spec.command, args: spec.args, env: serverEnv(spec, process.env), port: vet ? 0 : 8080, host: vet ? "127.0.0.1" : "0.0.0.0",
  approvedHash: spec.approved_hash, enabledTools: spec.enabled_tools,
  onEvent: (e) => out({ event: "blocked", name: spec.name, reason: e.reason, hash: e.hash }),
});
const st = b.status();
if (vet) {
  out({ event: "vetted", name: spec.name, ...st, definitions: b.definitions() });
  await b.close();
  process.exit(0);
}
out({ event: st.state === "serving" ? "serving" : "blocked", name: spec.name, reason: st.reason, hash: st.hash, tools: st.tools });
for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => void b.close().then(() => process.exit(0)));
