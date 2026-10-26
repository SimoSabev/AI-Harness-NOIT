import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FileKeyStore, loadKek, mintBootToken } from "@mandat/llm-proxy";
import { buildProxyRunArgs, dockerText, ensureUpstreamNetwork, imageTags } from "@mandat/sandbox";
import { infraUserFor } from "@mandat/worker";
import type { HostConfig } from "@mandat/worker";
import type { CliDeps } from "../deps.js";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

const NAME = "mandat-llm-proxy";

async function containerImage(deps: CliDeps): Promise<{ running: boolean; image: string | null }> {
  const r = await dockerText(deps.docker, ["inspect", "-f", "{{.State.Running}} {{.Config.Image}}", NAME]);
  if (r.exitCode !== 0) return { running: false, image: null };
  const [running, image] = r.stdout.trim().split(" ");
  return { running: running === "true", image: image ?? null };
}

async function waitHealthz(deps: CliDeps, port: number, ms: number): Promise<boolean> {
  for (let t = 0; t < ms; t += 250) {
    if ((await deps.healthz(port)).ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** 6.13 / D-099. ANTHROPIC_API_KEY is read ONLY here, from this command's env, and only passed by name (D-043). */
// D-293: `force` recreates a healthy proxy (new keys from the UI of `mandat local`).
export async function proxyStart(io: Io, deps: CliDeps, o: { mandatHome: string; host: HostConfig; json: boolean; force?: boolean }): Promise<number> {
  const port = o.host.proxyAdminPort;
  const tags = await imageTags(repoRoot);
  const cur = await containerImage(deps);
  if (!o.force && cur.running && cur.image === tags.proxy && (await deps.healthz(port)).ok) {
    if (o.json) printJson(io, { state: "running", healthz: "ok", port });
    else io.stdout("already running\n");
    return 0;
  }
  // E7в / D-313: the keys come from this command's env (and are sealed into the store) or from the store
  const store = new FileKeyStore(o.mandatHome, loadKek({ env: io.env, mandatHome: o.mandatHome }));
  const envKey = io.env.ANTHROPIC_API_KEY;
  const envOpenai = io.env.OPENAI_API_KEY;
  if (envKey !== undefined && envKey !== "") {
    store.put("anthropic", envKey);
    if (envOpenai) store.put("openai", envOpenai);
  }
  // E9г (D-400): the research search key (Exa) lives with the model keys, sealed, and reaches only the proxy
  if (io.env.EXA_API_KEY) store.put("research:exa", io.env.EXA_API_KEY);
  const exa = store.get("research:exa");
  const key = store.get("anthropic");
  if (key === null) {
    io.stderr("няма ключ: въведи го в „Ключове“ в UI или веднъж: ANTHROPIC_API_KEY=… pnpm mandat proxy start\n");
    return 3;
  }
  await ensureUpstreamNetwork(deps.docker);
  const dir = path.join(o.mandatHome, "proxy");
  mkdirSync(dir, { recursive: true });
  const secret = path.join(dir, "secret");
  if (!existsSync(secret)) {
    writeFileSync(secret, randomBytes(32), { mode: 0o600 });
    chmodSync(secret, 0o600);
  }
  const recreate = cur.image !== null;
  if (recreate) await dockerText(deps.docker, ["rm", "-f", NAME], 60_000);
  const { user } = await infraUserFor(deps.docker);
  const publicEnv: Record<string, string> = { MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret" };
  // E3в: OpenAI only when given for this command; prices and upstreams are not secrets (S33, docs/setup/keys.md)
  for (const k of ["MANDAT_PROXY_OPENAI_PRICES", "MANDAT_UPSTREAM_ANTHROPIC", "MANDAT_UPSTREAM_OPENAI"] as const) if (io.env[k]) publicEnv[k] = io.env[k] as string;
  const openai = store.get("openai");
  // D-293: which providers have a key — names only, never values (read back by proxyProviders)
  publicEnv.MANDAT_PROXY_PROVIDERS = openai ? "anthropic,openai" : "anthropic";
  if (o.host.extraCa !== undefined) publicEnv.NODE_EXTRA_CA_CERTS = "/etc/mandat-ca.pem";
  const args = buildProxyRunArgs({
    name: NAME, image: tags.proxy, user, mandatHome: o.mandatHome, publishAdminPort: port, publishInferencePort: o.host.proxyInferencePort,
    envNames: ["MANDAT_PROXY_BOOT_TOKEN"], publicEnv, ...(o.host.extraCa !== undefined ? { caFile: o.host.extraCa } : {}),
  });
  // D-345: the container gets only a one-time boot token (by name, D-043); the keys go once over the loopback admin port.
  const boot = mintBootToken();
  const started = await deps.docker.run(args, { env: { MANDAT_PROXY_BOOT_TOKEN: boot }, stdin: "closed", timeoutMs: 60_000 });
  if (started.exitCode !== 0) {
    io.stderr("cannot start mandat-llm-proxy\n");
    return 3;
  }
  if (!(await waitHealthz(deps, port, 10_000))) {
    await dockerText(deps.docker, ["rm", "-f", NAME], 60_000);
    io.stderr("llm-proxy: healthz did not answer within 10 s\n");
    return 3;
  }
  if (!(await deps.bootProxy(port, boot, { anthropic: key, ...(openai ? { openai } : {}), ...(exa ? { search: { exa } } : {}) }))) {
    await dockerText(deps.docker, ["rm", "-f", NAME], 60_000);
    io.stderr("llm-proxy: the boot exchange failed\n");
    return 3;
  }
  if (o.json) printJson(io, { state: "running", healthz: "ok", port });
  else io.stdout(`${recreate ? "recreated" : "started"}, healthz ok (127.0.0.1:${port})\n`);
  return 0;
}

/**
 * D-293: the providers the running proxy has a key for, from its public env MANDAT_PROXY_PROVIDERS. The Go template
 * prints only that one variable, so no key value ever leaves `docker inspect`. null = the proxy is not running.
 */
export async function proxyProviders(deps: CliDeps): Promise<string[] | null> {
  // a proxy from an older image (before an update) counts as stopped: the UI asks for the key again → recreated
  const cur = await containerImage(deps);
  if (!cur.running || cur.image !== (await imageTags(repoRoot)).proxy) return null;
  const r = await dockerText(deps.docker, ["inspect", "-f", '{{if .State.Running}}{{range .Config.Env}}{{if eq (index (split . "=") 0) "MANDAT_PROXY_PROVIDERS"}}{{println .}}{{end}}{{end}}{{end}}', NAME]);
  if (r.exitCode !== 0) return null;
  const line = r.stdout.split("\n").find((l) => l.startsWith("MANDAT_PROXY_PROVIDERS="));
  if (!line) return r.stdout.trim() === "" ? null : [];
  return line.slice("MANDAT_PROXY_PROVIDERS=".length).split(",").filter((x) => x === "anthropic" || x === "openai");
}

export async function proxyStop(io: Io, deps: CliDeps, o: { json: boolean; port: number }): Promise<number> {
  await dockerText(deps.docker, ["rm", "-f", NAME], 60_000);
  if (o.json) printJson(io, { state: "stopped", healthz: null, port: o.port });
  else io.stdout("stopped\n");
  return 0;
}

export async function proxyStatus(io: Io, deps: CliDeps, o: { json: boolean; port: number }): Promise<number> {
  const cur = await containerImage(deps);
  if (!cur.running) {
    if (o.json) printJson(io, { state: "stopped", healthz: null, port: o.port });
    else io.stdout("stopped\n");
    return 3;
  }
  const h = await deps.healthz(o.port);
  if (o.json) printJson(io, { state: "running", healthz: h.ok ? "ok" : "fail", port: o.port });
  else io.stdout(h.ok ? `running, healthz ok (127.0.0.1:${o.port})\n` : "running, healthz fail\n");
  return h.ok ? 0 : 3;
}
