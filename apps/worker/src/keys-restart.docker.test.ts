import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { mintBootToken, mintTaskToken } from "@mandat/llm-proxy";
import { buildProxyRunArgs, dockerText } from "@mandat/sandbox";
import { dockerEnv } from "./testing.js";

// E7в (AC-3.8, D-313/D-345): the real proxy container starts locked, takes the keys once with the boot token, never has
// the key in its env (`docker inspect`), and after a restart is locked again (spent token) until a new token comes.
let env: Awaited<ReturnType<typeof dockerEnv>>;
let port = 0;
const id = ulid().toLowerCase().slice(-10);
const stub = `mandat-test-stub-${id}` as const;
const proxy = `mandat-llm-proxy-test-${id}` as const;
const home = mkdtempSync(path.join(os.tmpdir(), "keys-restart-"));
const secret = randomBytes(32);
const KEY = ["sk", "ant", "api03", randomBytes(30).toString("base64url")].join("-");
const freePort = () => new Promise<number>((resolve) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as net.AddressInfo).port;
    s.close(() => resolve(p));
  });
});
const healthz = () => fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json() as Promise<{ locked: boolean; providers: string[] }>);
async function waitUp(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("proxy did not come up");
}
const boot = (token: string) => fetch(`http://127.0.0.1:${port}/admin/boot`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ anthropic: KEY }) }).then((r) => r.status);
/** one inference call from inside mandat-upstream (the inference port is not published) */
async function infer(): Promise<number> {
  const token = mintTaskToken(secret, { t: "t_keys", r: `r_${ulid()}`, a: 1, e: Math.floor(Date.now() / 1000) + 600, b: 1, n: "aa" });
  const js = `fetch("http://${proxy}:8787/v1/messages",{method:"POST",headers:{"x-api-key":process.env.T,"content-type":"application/json"},body:JSON.stringify({model:"claude-sonnet-5-5",max_tokens:1,messages:[]})}).then(r=>{console.log(r.status)},()=>console.log(0))`;
  let out = "";
  await env.docker.run(["run", "--rm", "--network", "mandat-upstream", "-e", "T", "--entrypoint", "node", env.images.proxy, "-e", js], { env: { T: token }, stdin: "closed", timeoutMs: 60_000, onStdout: (c) => (out += c.toString()) });
  return Number(out.trim() || "0");
}

beforeAll(async () => {
  env = await dockerEnv();
  port = await freePort();
  mkdirSync(path.join(home, "proxy"), { recursive: true });
  writeFileSync(path.join(home, "proxy", "secret"), secret, { mode: 0o600 });
  const common = { image: env.images.proxy, user: env.user, mandatHome: home };
  expect((await dockerText(env.docker, buildProxyRunArgs({ ...common, name: stub, publishAdminPort: null, envNames: [], publicEnv: {}, command: ["node", "/opt/mandat/stub-upstream.mjs"] }))).exitCode).toBe(0);
});
afterAll(async () => {
  await dockerText(env.docker, ["rm", "-f", stub, proxy]);
});

async function startProxy(token: string): Promise<void> {
  await dockerText(env.docker, ["rm", "-f", proxy]);
  const publicEnv = { MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret", MANDAT_UPSTREAM_ANTHROPIC: `http://${stub}:9000`, MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM: "1", MANDAT_PROXY_PROVIDERS: "anthropic" };
  const args = buildProxyRunArgs({ image: env.images.proxy, user: env.user, mandatHome: home, name: proxy, publishAdminPort: port, envNames: ["MANDAT_PROXY_BOOT_TOKEN"], publicEnv });
  expect((await env.docker.run(args, { env: { MANDAT_PROXY_BOOT_TOKEN: token }, stdin: "closed", timeoutMs: 60_000 })).exitCode).toBe(0);
  await waitUp();
}

describe("keys survive a restart without living in env (E7в, docker)", () => {
  it("locked → boot → works; inspect has no key; restart → locked (spent token) → a new token → works", async () => {
    const t1 = mintBootToken();
    await startProxy(t1);
    expect(await healthz()).toMatchObject({ locked: true });
    expect(await infer()).toBe(503);
    expect(await boot(t1)).toBe(204);
    expect(await healthz()).toMatchObject({ locked: false, providers: ["anthropic"] });
    expect(await infer()).toBe(200);
    const inspect = (await dockerText(env.docker, ["inspect", proxy])).stdout;
    expect(inspect).not.toContain(KEY);
    expect(inspect).not.toContain("sk-ant");
    expect(inspect).toContain("MANDAT_PROXY_BOOT_TOKEN");
    // a container restart (docker's restart policy, a reboot): memory is gone, the token is spent
    expect((await dockerText(env.docker, ["restart", proxy])).exitCode).toBe(0);
    await waitUp();
    expect(await healthz()).toMatchObject({ locked: true });
    expect(await boot(t1)).toBe(401);
    // what `pnpm local` does (proxy-heal): recreate with a new token and the sealed key
    const t2 = mintBootToken();
    await startProxy(t2);
    expect(await boot(t2)).toBe(204);
    expect(await infer()).toBe(200);
  });
});
