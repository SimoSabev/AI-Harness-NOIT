import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_ROUTES } from "@mandat/channels";
import { npmAllowlistFromLockfile } from "@mandat/egress-gate";
import { packTree } from "@mandat/export";
import { mintTaskToken } from "@mandat/llm-proxy";
import { buildProxyRunArgs, dockerText, names } from "@mandat/sandbox";
import type { GateRoute } from "@mandat/contract";
import { readGateLog, runSandbox, startRunGate } from "@mandat/worker";
import { cleanupRun, dockerEnv, repoRoot, tempRun } from "../../../apps/worker/src/testing.js";

let env: Awaited<ReturnType<typeof dockerEnv>>;
const run = tempRun();
const vol = names.vol(run.runId, "agent");
const sctx = () => ({ docker: env.docker, runId: run.runId, runDir: run.runDir, mandatHome: run.mandatHome, home: run.home, image: env.images.sandbox, ipv6Sysctl: env.ipv6Sysctl });
const gateCtx = (extra: { llmProxyUrl?: string } = {}) => ({ docker: env.docker, runId: run.runId, runDir: run.runDir, mandatHome: run.mandatHome, home: run.home, tree: "agent" as const, gateImage: env.images.gate, user: env.user, extraCa: env.host.extraCa, ...extra });

async function sh(o: { network: string; script: string; secrets?: Record<string, string>; phase?: "install" | "agent" | "none" }) {
  let out = "";
  const r = await runSandbox(sctx(), {
    role: "agent", volume: vol, network: o.network, tree: "agent", timeoutMs: 300_000,
    env: { phase: o.phase ?? "none", ...(o.secrets ? { secrets: o.secrets } : {}) },
    cmd: ["sh", "-c", o.script], onStdout: (c) => (out += c.toString()), onStderr: (c) => (out += c.toString()),
  });
  return { exit: r.exitCode, out };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  env = await dockerEnv();
  await dockerText(env.docker, ["volume", "create", "--label", `mandat.run=${run.runId}`, vol]);
});
afterAll(async () => {
  await cleanupRun(env.docker, run.runId);
});

describe("egress gate (docker)", () => {
  it("gate DNS (S3b) и AAAA (D-045)", async () => {
    const gate = await startRunGate(gateCtx(), { phase: "agent", routes: [...API_KEY_ROUTES] });
    try {
      const js = `const d=require("dns");Promise.all([d.promises.resolve4("evil.example").then(()=>"answer",e=>e.code),d.promises.resolve6("egress-gate").then(a=>"aaaa:"+a.length,e=>e.code)]).then(x=>console.log(x.join(" ")))`;
      const r = await sh({ network: gate.net, script: `node -e '${js}'` });
      expect(r.out.trim()).toBe("ENOTFOUND ENODATA");
      await sleep(300);
      const log = readGateLog(gate.paths.log);
      expect(log.some((l) => l.kind === "dns_block" && l.qname === "evil.example")).toBe(true);
      expect(log.some((l) => l.kind === "dns_block" && l.qname === "egress-gate")).toBe(false);
    } finally {
      await gate.stop();
    }
  });

  it("gate→прокси→stub (D-048, D-117)", async () => {
    const id = randomBytes(4).toString("hex");
    const stub = `mandat-test-stub-${id}`;
    const proxy = `mandat-llm-proxy-test-${id}`;
    const secret = randomBytes(32);
    mkdirSync(path.join(run.mandatHome, "proxy"), { recursive: true });
    writeFileSync(path.join(run.mandatHome, "proxy", "secret"), secret, { mode: 0o600 });
    const common = { image: env.images.proxy, user: env.user, mandatHome: run.mandatHome, publishAdminPort: null, envNames: [] as string[] };
    try {
      expect((await dockerText(env.docker, buildProxyRunArgs({ ...common, name: stub as `mandat-test-stub-${string}`, publicEnv: {}, command: ["node", "/opt/mandat/stub-upstream.mjs"] }))).exitCode).toBe(0);
      expect((await dockerText(env.docker, buildProxyRunArgs({
        ...common, name: proxy as `mandat-llm-proxy-test-${string}`,
        publicEnv: { MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret", MANDAT_PROXY_UPSTREAM_URL: `http://${stub}:9000`, MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM: "1" },
      }))).exitCode).toBe(0);
      await sleep(1500);
      const gate = await startRunGate(gateCtx({ llmProxyUrl: `http://${proxy}:8787` }), { phase: "agent", routes: [...API_KEY_ROUTES] });
      try {
        const token = mintTaskToken(secret, { t: "t_dt", r: run.runId, a: 1, e: Math.floor(Date.now() / 1000) + 600, b: 1, n: randomBytes(8).toString("hex") });
        const fakeKey = ["sk", "ant", "x"].join("-");
        const js = `const post=k=>fetch("http://egress-gate/v1/messages",{method:"POST",headers:{"x-api-key":k,"content-type":"application/json"},body:JSON.stringify({model:"claude-sonnet-5-5",max_tokens:5,messages:[]})}).then(async r=>r.status+":"+(r.headers.get("content-type")||"")+":"+(await r.text()).includes("message_stop"));Promise.all([post(process.env.ANTHROPIC_API_KEY),post("${fakeKey}")]).then(x=>console.log(x.join(" ")))`;
        const r = await sh({ network: gate.net, script: `node -e '${js}'`, phase: "agent", secrets: { ANTHROPIC_API_KEY: token, AWS_SECRET_ACCESS_KEY: "c".repeat(40) } });
        expect(r.out.trim()).toBe("200:text/event-stream:true 401:application/json:false");
      } finally {
        await gate.stop();
      }
      const usage = readFileSync(path.join(run.mandatHome, "proxy", "usage.jsonl"), "utf8");
      expect(usage).toContain('"status":200');
      expect(usage).not.toContain("mdt_");
    } finally {
      await dockerText(env.docker, ["rm", "-f", stub, proxy]);
    }
  });

  it("install през gate; затворена фаза → npm ci пада", async () => {
    const shop = path.join(repoRoot, "fixtures/shop");
    const lock = JSON.parse(readFileSync(path.join(shop, "package-lock.json"), "utf8")) as unknown;
    const allow = npmAllowlistFromLockfile(lock);
    if (!allow.ok) throw new Error(allow.reason);
    const routes: GateRoute[] = allow.routes;
    const seed = await runSandbox(sctx(), { role: "seed", volume: vol, network: "none", env: { phase: "none" }, cmd: ["tar", "-x", "-C", "/m/work"], stdin: packTree(shop), timeoutMs: 60_000 });
    expect(seed.exitCode).toBe(0);
    const gate = await startRunGate(gateCtx(), { phase: "install", routes });
    try {
      const r = await sh({ network: gate.net, phase: "install", script: "npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1; echo exit=$?; test -d node_modules/vitest && echo vitest" });
      expect(r.out.trim().split("\n")).toEqual(["exit=0", "vitest"]);
      await gate.setPolicy("closed", []);
      const again = await sh({ network: gate.net, phase: "install", script: "npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1; echo exit=$?" });
      expect(again.out.trim()).not.toBe("exit=0");
    } finally {
      await gate.stop();
    }
  });

  it("build context без тайни (D-078)", () => {
    const sentinel = path.join(repoRoot, ".mandat", "sentinel");
    mkdirSync(path.dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, "x");
    try {
      const secretArgs = env.host.extraCa ? ["--secret", `id=extra_ca,src=${env.host.extraCa}`] : [];
      execFileSync("docker", ["build", "-q", "--target", "build", "-t", "mandat-ctx-check", ...secretArgs, "-f", "docker/egress-gate/Dockerfile", "."], { cwd: repoRoot, stdio: "pipe" });
      execFileSync("docker", ["run", "--rm", "mandat-ctx-check", "sh", "-c", "test ! -e /src/.mandat && test ! -e /src/.git"], { stdio: "pipe" });
    } finally {
      rmSync(sentinel, { force: true });
      spawnRmi();
    }
  });
});

function spawnRmi() {
  try {
    execFileSync("docker", ["rmi", "-f", "mandat-ctx-check"], { stdio: "pipe" });
  } catch {
    /* ignore */
  }
}
