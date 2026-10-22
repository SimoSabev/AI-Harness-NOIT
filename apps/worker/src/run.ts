import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import {
  MandatError, Verdict, contractForAgent, createStreamCtx, hashJcs, parseContract, renderAgentContract, sha256Tag, ulid, installCommand, lockAllowlist, packageManagerOf, profileHash,
} from "@mandat/contract";
import type { Contract, ErrorCode, Evidence, GateLogLine, HarnessProfile, SecurityEvent, StreamEvent } from "@mandat/contract";
import { compileProfile, grantOnce, parseAsks } from "@mandat/profile";
import type { Ask } from "@mandat/profile";
import { seedHarness } from "./harness-seed.js";
import { claudeAdapter, codexAdapter, fakeAdapter, fakeCodexAdapter, isFakeCodexScenario, isFakeScenario } from "@mandat/agents";
import type { AgentAdapter, FakeCodexScenario, FakeScenario } from "@mandat/agents";
import { channelFor } from "@mandat/channels";
import type { Channel, TaskUsage } from "@mandat/channels";
import { buildReasons, canaryCheck, decideVerdict, ev, na } from "@mandat/core";
import { cleanClone, exportChangeset, packTree, readLockfile, recomputeTreeSha } from "@mandat/export";
import type { ChangesetExport } from "@mandat/contract";
import { mintTaskToken } from "@mandat/llm-proxy";
import { createRedactor } from "@mandat/redaction";
import { compareVersions, dockerText, ensureUpstreamNetwork, imageTags, names, probeIpv6, profileVolume, realDockerRunner, sweepOrphans } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { RunWriter, VerifyInfraError, acquireRunLock, hostConfig, infraUserFor, readGateLog, runSandbox, safeReadVolume, startRunGate, verifyTrees } from "@mandat/verify";
import type { RunGate, runTestProcedure } from "@mandat/verify";

export interface RunHooks {
  beforeVerdict?: (runDir: string) => Promise<void>;
  onCanary?: (value: string) => void;
  /** E7д (D-310): every line of the agent → the unified stream (redacted); never throws into the run */
  onStream?: (ev: StreamEvent) => void;
  /** E7д: the proxy usage poll (USD so far) for the live session */
  onUsage?: (runId: string, usd: number) => void;
  /** E8g (D-353): new steer texts from people since the last call; polled while a steerable agent runs */
  steer?: () => Promise<{ text: string; author: string }[]>;
}
export interface RunTaskInput {
  home: string;
  contractPath: string;
  agent: "claude" | "codex" | `fake:${FakeScenario}` | `fake-codex:${FakeCodexScenario}`;
  keep: boolean;
  json: boolean;
  docker?: DockerRunner;
  hooks?: RunHooks;
  now?: () => Date;
  /** mirror name under <home>/mirrors (default "shop"; the online worker uses "demo-shop") */
  mirror?: string;
  /** v5 E8а: the approved harness profile of the repo → compiled into /m/in/harness for the agent */
  profile?: HarnessProfile;
  /** extra rule subjects (account:<name>, night); "agent:<claude|codex>" and "any" are always added */
  subjects?: string[];
  /** E8g: ask rules a person allowed once for this attempt (they become allow in the compiled policy) */
  grantOnce?: string[];
  /** test/CLI seams (not part of the 6.14 contract) */
  internals?: RunInternals;
}
export interface RunInternals {
  repoRoot?: string;
  env?: Record<string, string | undefined>;
  progress?: (line: string) => void;
  startGate?: typeof startRunGate;
  runTests?: typeof runTestProcedure;
  recompute?: typeof recomputeTreeSha;
  images?: { sandbox: string; gate: string; proxy: string };
  gitVersion?: () => string | null;
  healthz?: (port: number) => Promise<boolean>;
  channel?: Channel;
  usagePollMs?: number;
  /** E3в: the proxy the gate forwards to (default http://mandat-llm-proxy:8787; tests use a test proxy) */
  llmProxyUrl?: string;
  ipv6Sysctl?: boolean;
  infraUser?: string;
}
export interface RunTaskOutput {
  verdict: Verdict | null;
  exit: 0 | 2 | 3 | 5 | 10 | 20 | 130;
  runDir: string | null;
  ledger: { from: number; to: number } | null;
  agentExit: number | null;
  error?: { code: ErrorCode; message: string };
  /** E3в: the last upstream 429 of the attempt (from the proxy), for the limit chain */
  limit?: TaskUsage["limit"];
  /** D-293: the provider rejected the key (upstream 401/403 seen by the proxy) */
  authFailed?: boolean;
  /** E8g: what the agent asked for (ask rules of the policy it hit); non-empty → the task waits for a person */
  asks?: Ask[];
}

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const base62 = (n: number): string => Array.from(randomBytes(n), (b) => BASE62[b % 62]).join("");
/** D-295: the CLI's own words for a missing / expired / rejected subscription login (Claude Code 2.1.302) [НП: exact texts]. */
export function looksLikeLoginProblem(line: string): boolean {
  return /not logged in|please run \/login|login expired|oauth token has expired|authentication_error|invalid api key/i.test(line) && !/"type":"assistant"/.test(line);
}

const ZERO_USAGE: TaskUsage = { usd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0, budgetStop: false, limit: null, authFailed: false };
const defaultRepoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

class InfraError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}
const infra = (code: ErrorCode, message: string): never => {
  throw new InfraError(code, message);
};

function gitVersion(): string | null {
  const r = spawnSync("git", ["--version"], { encoding: "utf8" });
  return r.status === 0 ? (/(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1] ?? null) : null;
}

async function realHealthz(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) })).status === 200;
  } catch {
    return false;
  }
}

function adapterFor(agent: string, model: string): AgentAdapter {
  if (agent === "claude") return claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" });
  if (agent === "codex") return codexAdapter({ model, cliVersion: "0.160.1" });
  if (agent.startsWith("fake-codex:")) {
    const c = agent.slice(11);
    if (!isFakeCodexScenario(c)) throw new MandatError("E_USAGE", `unknown agent: ${agent}`);
    return fakeCodexAdapter(c);
  }
  const s = agent.startsWith("fake:") ? agent.slice(5) : "";
  if (!isFakeScenario(s)) throw new MandatError("E_USAGE", `unknown agent: ${agent}`);
  return fakeAdapter(s);
}

/** 7.3–7.10. Preflight errors (steps 1–6) never touch the ledger (D-038); after step 7 everything ends with a verdict (D-019). */
export async function runTask(i: RunTaskInput): Promise<RunTaskOutput> {
  const x = i.internals ?? {};
  const env = x.env ?? process.env;
  const now = i.now ?? (() => new Date());
  const progress = x.progress ?? (() => undefined);
  const docker = i.docker ?? realDockerRunner();
  const repoRoot = x.repoRoot ?? defaultRepoRoot;
  const fail = (code: ErrorCode, message: string): RunTaskOutput => {
    const ex = code === "E_USAGE" || code === "E_LOCKED" ? 2 : code === "E_CONTRACT_INVALID" || code === "E_CONTRACT_HASH" ? 5 : 3;
    return { verdict: null, exit: ex, runDir: null, ledger: null, agentExit: null, error: { code, message } };
  };

  // ---- preflight 1: lock
  let release: () => void;
  try {
    release = acquireRunLock(i.home);
  } catch (e) {
    if (e instanceof MandatError) return fail(e.code, e.message);
    throw e;
  }
  let interrupted = false;
  const onSigint = (): void => {
    interrupted = true;
  };
  process.on("SIGINT", onSigint);
  try {
    // ---- 2: contract and agent
    let contract: Contract;
    try {
      contract = parseContract(JSON.parse(readFileSync(i.contractPath, "utf8")));
    } catch (e) {
      if (e instanceof MandatError) return fail(e.code, e.message);
      return fail("E_CONTRACT_INVALID", `cannot read contract: ${(e as Error).message}`);
    }
    let adapter: AgentAdapter;
    try {
      adapter = adapterFor(i.agent, contract.channel.model);
    } catch (e) {
      return fail("E_USAGE", (e as Error).message);
    }
    // ---- 3: the key never reaches mandat run (D-008)
    if (process.env.ANTHROPIC_API_KEY !== undefined) {
      delete process.env.ANTHROPIC_API_KEY;
      process.stderr.write("ANTHROPIC_API_KEY removed from mandat run env (D-008)\n");
    }
    if (env !== process.env && env.ANTHROPIC_API_KEY !== undefined) delete env.ANTHROPIC_API_KEY;
    // E3в: the same for the OpenAI key (Codex never gets it; only the proxy has it)
    if (process.env.OPENAI_API_KEY !== undefined) delete process.env.OPENAI_API_KEY;
    if (env !== process.env && env.OPENAI_API_KEY !== undefined) delete env.OPENAI_API_KEY;
    // ---- 4: environment
    const host = hostConfig(env);
    const dv = await dockerText(docker, ["version", "--format", "{{.Server.Version}}"]);
    if (dv.exitCode !== 0 || compareVersions(dv.stdout.trim(), "25.0.5") < 0) return fail("E_DOCKER_VERSION", `docker ${dv.stdout.trim() || "unreachable"} < 25.0.5`);
    const gv = (x.gitVersion ?? gitVersion)();
    if (gv === null || compareVersions(gv, "2.43.0") < 0) return fail("E_GIT_VERSION", `git ${gv ?? "missing"} < 2.43.0`);
    const images = x.images ?? (await imageTags(repoRoot));
    for (const t of [images.sandbox, images.gate]) {
      if ((await dockerText(docker, ["image", "inspect", t])).exitCode !== 0) return fail("E_IMAGES_MISSING", `${t} missing; пусни pnpm mandat images build`);
    }
    const proxyUp = await (x.healthz ?? realHealthz)(host.proxyAdminPort);
    // D-295: a subscription profile run never touches the proxy
    if ((i.agent === "claude" || i.agent === "codex") && contract.channel.kind !== "cli_profile" && !proxyUp) return fail("E_PROXY_DOWN", `llm-proxy is not answering on 127.0.0.1:${host.proxyAdminPort}`);
    // ---- 5: mirror and base
    const mirrorPath = path.join(i.home, "mirrors", `${i.mirror ?? "shop"}.git`);
    if (!existsSync(mirrorPath)) return fail("E_MIRROR_MISSING", "mirror missing; пусни pnpm mandat fixtures build");
    const cat = spawnSync("git", ["--git-dir", mirrorPath, "cat-file", "-e", `${contract.base_commit}^{commit}`], { env: { PATH: process.env.PATH ?? "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", HOME: os.tmpdir() } }); // T3-7: sha (GitSha in the contract)
    if (cat.status !== 0) return fail("E_BASE_NOT_FOUND", `base_commit ${contract.base_commit} not in the mirror`);
    // ---- 6
    try {
      await ensureUpstreamNetwork(docker);
      await sweepOrphans(docker, { olderThanMs: 2 * 3600_000, now: now() });
    } catch (e) {
      return fail("E_DOCKER", (e as Error).message);
    }
    if (interrupted) return { ...fail("E_INTERRUPTED", "interrupted"), exit: 130 };

    // ---- 7: the run exists from here on
    const runId = `r_${ulid(now().getTime())}`;
    const runDir = path.join(i.home, "runs", runId);
    const canary = base62(40);
    let token = "";
    i.hooks?.onCanary?.(canary);
    const w = new RunWriter(i.home, runDir, createRedactor({ exactSecrets: [canary] }), now);
    let redactor = w.r;
    const setToken = (t: string): void => {
      token = t;
      redactor = createRedactor({ exactSecrets: [canary, token] });
      (w as { r: typeof redactor }).r = redactor;
    };
    const timings: Record<"provision" | "install" | "agent" | "export" | "verify" | "verdict" | "total", number> = { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 };
    const t0 = Date.now();
    const timed = async <T>(k: keyof typeof timings, fn: () => Promise<T>): Promise<T> => {
      const s = Date.now();
      try {
        return await fn();
      } finally {
        timings[k] += Date.now() - s;
      }
    };
    const out = (s: string): void => progress(s);
    w.raw("contract.json", readFileSync(i.contractPath));
    w.raw("canary.json", JSON.stringify({ name: "AWS_SECRET_ACCESS_KEY", value_hash: sha256Tag(canary) }) + "\n");
    w.ledger("task_created", contract.task_id, { task_id: contract.task_id, run_id: runId, agent: adapter.id, contract_hash: contract.contract_hash });
    w.ledger("memory_snapshot", contract.task_id, { snapshot_hash: null, reason: "memory_disabled_e0" });
    out(`mandat run ${runId} task=${contract.task_id} agent=${adapter.id} base=${contract.base_commit.slice(0, 7)}`);

    const sec = (e: { kind: SecurityEvent["kind"]; severity: SecurityEvent["severity"]; detail: SecurityEvent["detail"]; source: SecurityEvent["source"] }): void => {
      w.security({ task_id: contract.task_id, run_id: runId, attempt: 1, ...e });
    };
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), `mandat-${runId}-`));
    const vol = names.vol(runId, "agent");
    let gate: RunGate | undefined;
    let channel: Channel | undefined;
    let usage: TaskUsage = ZERO_USAGE;
    let agentExit: number | null = null;
    let exportResult: ChangesetExport | null = null;
    let diffPatch: Buffer | null = null;
    let integrity: "ok" | "mismatch" | "n/a" = "n/a";
    const aliases: string[] = [];
    const evd = new Map<string, Evidence>();
    let harness: { target: "claude" | "codex"; argv: string[]; env: Record<string, string>; hash: string; enforced: { rule: string; why: string }[]; unsupported: { rule: string; why: string }[]; files: { path: string; bytes: string }[]; granted: string[] } | null = null;
    let asks: Ask[] = [];
    const set = (e: Evidence): void => {
      evd.set(e.detector, e);
    };
    const gateLogs: { tree: string; file: string }[] = [];
    let infraCode: ErrorCode | null = null;
    let agentStop: "timeout" | "budget_stop" | null = null;
    const startGate = x.startGate ?? startRunGate;
    const user = x.infraUser ?? (await infraUserFor(docker).catch(() => ({ user: "1000:1000" }))).user;
    const ipv6Sysctl = x.ipv6Sysctl ?? (await probeIpv6(docker, images.sandbox));
    const sctx = { docker, runId, runDir, mandatHome: i.home, home: os.homedir(), image: images.sandbox, ipv6Sysctl };
    const gctx = (tree: "agent" | "base" | "a" | "b") => ({ docker, runId, runDir, mandatHome: i.home, home: os.homedir(), tree, gateImage: images.gate, user, extraCa: host.extraCa, ...(x.llmProxyUrl !== undefined ? { llmProxyUrl: x.llmProxyUrl } : {}) });
    let baseDir = "";

    const pm = packageManagerOf(contract.repo_config); // D-301
    try {
      // ---------- PROVISION (7.4)
      await timed("provision", async () => {
        const clone = await cleanClone({ mirrorPath, baseSha: contract.base_commit, tmpRoot, name: "base" });
        baseDir = clone.dir;
        const b = readLockfile(baseDir, pm);
        const allow = lockAllowlist(pm, b ? b.toString("utf8") : null);
        if (!allow.ok) infra("E_LOCKFILE_BASE", `base lockfile rejected: ${allow.reason}`);
        if ((await dockerText(docker, ["volume", "create", "--label", `mandat.run=${runId}`, vol])).exitCode !== 0) infra("E_DOCKER", "volume create failed");
        const seed = await runSandbox(sctx, { role: "seed", volume: vol, network: "none", env: { phase: "none" }, cmd: ["tar", "-x", "-C", "/m/work"], stdin: packTree(baseDir), timeoutMs: 120_000 });
        if (seed.exitCode !== 0) infra("E_DOCKER", "seed failed");
        const text = renderAgentContract(contractForAgent(contract));
        await w.text("agent-contract.txt", text);
        const c = await runSandbox(sctx, { role: "seed", user: "0:0", volume: vol, network: "none", env: { phase: "none" }, cmd: ["sh", "-c", "cat > /m/in/contract.txt && chmod 0444 /m/in/contract.txt"], stdin: PassThrough.from([text]) as unknown as NodeJS.ReadableStream, timeoutMs: 60_000 });
        if (c.exitCode !== 0) infra("E_DOCKER", "contract seed failed");
        // v5 E8а (D-311): the profile's control layer → /m/in/harness (root, read-only for the agent) before the agent
        if (i.profile) {
          const target = adapter.id === "codex" || adapter.id.startsWith("fake-codex:") ? "codex" : "claude";
          const base = target === "codex" ? "codex" : "claude";
          const granted = i.grantOnce ?? [];
          const prof = granted.length > 0 ? { ...i.profile, layers: { ...i.profile.layers, c: grantOnce(i.profile.layers.c, granted) } } : i.profile;
          const m = compileProfile({ ...prof, profile_hash: granted.length > 0 ? profileHash(prof.layers) : prof.profile_hash }, target, { runId, subjects: [`agent:${base}`, ...(i.subjects ?? [])] });
          harness = { target, argv: m.argv, env: m.env, hash: await seedHarness(sctx, vol, m.files), enforced: m.enforced_by_harness, unsupported: m.unsupported, files: m.files, granted };
          if (target === "codex") {
            const cp = await runSandbox(sctx, { role: "seed", volume: vol, network: "none", env: { phase: "none" }, cmd: ["sh", "-c", "mkdir -p /m/codex-home && cp -R /m/in/harness/codex/. /m/codex-home/ && chmod -R u+w /m/codex-home"], timeoutMs: 60_000 });
            if (cp.exitCode !== 0) infra("E_DOCKER", "codex home seed failed");
          }
        }
        try {
          gate = await startGate(gctx("agent"), { phase: "install", routes: allow.ok ? allow.routes : [] });
        } catch (e) {
          infra((e as { code?: ErrorCode }).code === "E_GATE_POLICY" ? "E_GATE_POLICY" : "E_GATE_START", (e as Error).message);
        }
        gateLogs.push({ tree: "agent", file: (gate as RunGate).paths.log });
        out(`[provision] sandbox+gate ok`);
      });
      if (interrupted) infra("E_INTERRUPTED", "interrupted");
      // ---------- INSTALL (7.5)
      await timed("install", async () => {
        const r = await runSandbox(sctx, { role: "install", volume: vol, network: (gate as RunGate).net, tree: "agent", env: { phase: "install" }, cmd: installCommand(pm), timeoutMs: 300_000 });
        if (r.exitCode !== 0 || r.timedOut) infra("E_INSTALL_BASE", `${pm} install exit ${r.exitCode}`);
        out(`[install]   ${contract.repo_config.runtime.install} via gate`);
      });
      if (interrupted) infra("E_INTERRUPTED", "interrupted");
      // ---------- AGENT (7.6)
      await timed("agent", async () => {
        const g = gate as RunGate;
        try {
          channel = x.channel ?? channelFor(contract.channel, { proxyAdminUrl: `http://127.0.0.1:${host.proxyAdminPort}`, secretPath: path.join(i.home, "proxy", "secret") });
          await g.setPolicy("agent", channel.gateRoutes(), channel.gateTunnels?.());
        } catch (e) {
          infra((e as { code?: ErrorCode }).code === "E_GATE_POLICY" ? "E_GATE_POLICY" : "E_CHANNEL_UNSUPPORTED", (e as Error).message);
        }
        const ch = channel as Channel;
        const viaProfile = ch.kind === "cli_profile" && ch.profileName !== undefined;
        const useProxy = !viaProfile && (i.agent === "claude" || i.agent === "codex" || (proxyUp && existsSync(path.join(i.home, "proxy", "secret"))));
        if (useProxy) {
          const cred = await ch.issueTaskCredential({ taskId: contract.task_id, runId, attempt: 1, budgetUsd: contract.repo_config.budgets.task_usd, ttlMin: contract.repo_config.budgets.task_minutes + 5 });
          setToken(cred.token);
        } else {
          setToken(mintTaskToken(randomBytes(32), { t: contract.task_id, r: runId, a: 1, e: Math.floor(now().getTime() / 1000) + 3600, b: contract.repo_config.budgets.task_usd, n: randomBytes(8).toString("hex"), ...(ch.provider === "openai" ? { p: "openai" as const } : {}) }));
        }
        const steerHook = adapter.supportsSteering && adapter.steerLine ? i.hooks?.steer : undefined;
        const launch = adapter.launch(
          { runId, taskId: contract.task_id, prompt: contract.text, model: contract.channel.model, budgetUsd: contract.repo_config.budgets.task_usd, contractFile: "/m/in/contract.txt", workdir: "/m/work", notesPath: "/m/out/notes.txt", ...(harness ? { harness: { argv: harness.argv, env: harness.env } } : {}), ...(steerHook ? { steer: { sessionId: randomUUID() } } : {}) },
          viaProfile ? { PROFILE: true } : ch.provider === "openai" ? { OPENAI_API_KEY: token } : { ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: token },
          { name: "AWS_SECRET_ACCESS_KEY", value: canary },
        );
        let events = 0;
        const denied: string[] = [];
        const streamCtx = createStreamCtx(runId);
        const onStream = i.hooks?.onStream;
        let loginProblem = false;
        let lastTool = "";
        let pollWarned = false;
        // Writes are chained so transcript.jsonl and agent-stderr.txt keep the stream order.
        let queue: Promise<void> = Promise.resolve();
        const enqueue = (fn: () => Promise<void>): void => {
          queue = queue.then(fn, fn);
        };
        const agentName = names.agent(runId);
        const stopAgent = async (why: "timeout" | "budget_stop"): Promise<void> => {
          if (agentStop) return;
          agentStop = why;
          await dockerText(docker, ["stop", "-t", "30", agentName], 90_000);
        };
        const poll = useProxy
          ? setInterval(() => {
              ch.usage(runId).then((u) => {
                usage = u;
                i.hooks?.onUsage?.(runId, u.usd);
                if (u.budgetStop) void stopAgent("budget_stop");
              }, () => {
                if (!pollWarned) {
                  pollWarned = true;
                  process.stderr.write("usage poll failed (ignored, D-049)\n");
                }
              });
            }, x.usagePollMs ?? 2000)
          : undefined;
        const limit = setTimeout(() => void stopAgent("timeout"), contract.repo_config.budgets.task_minutes * 60_000);
        // E8g (D-353): steering = stream-json on stdin. The task is the first line; people's steer texts follow (framed by
        // the adapter) until the agent's first result, then stdin ends and the agent finishes as before.
        let stdin: PassThrough | undefined;
        let steerPoll: NodeJS.Timeout | undefined;
        if (launch.stdin === "pipe" && steerHook && adapter.steerLine) {
          const line = adapter.steerLine.bind(adapter);
          const pipe = new PassThrough();
          stdin = pipe;
          if (launch.firstStdinLine) pipe.write(launch.firstStdinLine + "\n");
          const pump = async () => {
            const xs = await steerHook().catch(() => []);
            for (const s of xs) if (!pipe.writableEnded) pipe.write(line(s.text.slice(0, 2000), s.author.slice(0, 80)) + "\n");
          };
          await pump();
          steerPoll = setInterval(() => void pump(), x.usagePollMs ?? 2000);
        }
        try {
          const r = await runSandbox(sctx, {
            role: "agent", volume: vol, network: g.net, tree: "agent", name: agentName, init: true,
            ...(viaProfile && ch.profileName ? { profile: profileVolume("claude", ch.profileName) } : {}),
            env: { phase: "agent", secrets: launch.env, ...(ch.provider === "openai" ? { tokenName: "OPENAI_API_KEY" as const } : {}), ...(launch.publicEnv ? { extraPublic: launch.publicEnv } : {}) },
            cmd: launch.argv,
            timeoutMs: contract.repo_config.budgets.task_minutes * 60_000 + 120_000,
            ...(stdin ? { stdin: stdin as unknown as NodeJS.ReadableStream } : {}),
            onStdoutLine: (line) => {
              if (viaProfile && looksLikeLoginProblem(line)) loginProblem = true;
              for (const e of adapter.parseLine(line)) {
                events++;
                if (e.type === "tool_use") lastTool = e.name;
                if (e.type === "result" && stdin && !stdin.writableEnded) stdin.end();
              }
              if (onStream || harness) {
                try {
                  for (const ev of adapter.toStream(line, streamCtx)) {
                    if (ev.kind === "permission" && ev.tool) denied.push(ev.tool.name);
                    onStream?.(ev);
                  }
                } catch {
                  // the live view is best effort; the transcript and the verdict do not depend on it
                }
              }
              let row: object;
              try {
                const j: unknown = JSON.parse(line);
                row = j !== null && typeof j === "object" ? (j as object) : { raw: line };
              } catch {
                row = { raw: line };
              }
              enqueue(() => w.text("transcript.jsonl", row, { append: true, maxBytes: 52428800 }));
            },
            onStderr: (c) => {
              const text = c.toString("utf8");
              if (viaProfile && looksLikeLoginProblem(text)) loginProblem = true;
              enqueue(() => w.text("agent-stderr.txt", text, { append: true, maxBytes: 1048576 }));
            },
          });
          agentExit = agentStop ? null : r.exitCode;
        } finally {
          clearTimeout(limit);
          if (poll) clearInterval(poll);
          if (steerPoll) clearInterval(steerPoll);
          if (stdin && !stdin.writableEnded) stdin.end();
          await queue;
        }
        if (useProxy) {
          usage = await ch.usage(runId).catch(() => usage);
          await ch.revokeTaskCredential(runId).catch(() => undefined);
        }
        if (loginProblem) usage = { ...usage, authFailed: true }; // D-295 → the task says "sign in again"
        w.raw("agent-exit.json", JSON.stringify({ exit: agentExit, timedOut: agentStop === "timeout" }) + "\n");
        // SH2-CX (D-312): Codex runs from a writable copy (CODEX_HOME); a changed config after the run = config_change → UNKNOWN
        const tampered: string[] = [];
        if (harness?.target === "codex") {
          for (const f of harness.files.filter((x) => x.path.startsWith("codex/") && /\.(toml|json)$/.test(x.path))) {
            const now = await safeReadVolume(sctx, { volume: vol, file: `/m/codex-home/${f.path.slice("codex/".length)}`, limit: 1_048_576, role: "export" });
            if (now === null || now.toString("utf8") !== f.bytes) tampered.push(f.path);
          }
          if (tampered.length > 0) {
            sec({ kind: "config_change", severity: "warn", detail: { files: tampered.join(", ").slice(0, 300) }, source: "worker" });
            set(ev("AGENT", "unknown", `the agent changed its control layer: ${tampered.join(", ")}`.slice(0, 300), { files: tampered }, { cls: "config_change", id: tampered[0] ?? "-" }));
          }
        }
        if (harness) {
          // E8g (D-352): the hook's asks.jsonl is agent-writable; only asks naming an ask rule of the seeded policy count
          const raw = await safeReadVolume(sctx, { volume: vol, file: "/m/out/asks.jsonl", limit: 65_536, role: "export" }).catch(() => null);
          const policy = harness.files.find((f) => f.path === "policy.json");
          if (raw && policy) asks = parseAsks(raw.toString("utf8"), JSON.parse(policy.bytes) as { rules: { tool: string; decision: string; reason?: string }[] });
          await w.text("harness.json", { target: harness.target, files_hash: harness.hash, denied, tampered, enforced_by_harness: harness.enforced, unsupported: harness.unsupported, asks, granted_once: harness.granted });
        }
        await g.setPolicy("closed", []).catch(() => undefined);
        await g.stop();
        gate = undefined;
        out(`[agent]     exit ${agentExit ?? "-"} · ${events} events${lastTool ? ` · last ${lastTool}` : ""} · $${usage.usd.toFixed(4)}`);
        if (agentStop === "budget_stop") sec({ kind: "budget_stop", severity: "warn", detail: { usd: usage.usd }, source: "proxy" });
      });
      if (interrupted) infra("E_INTERRUPTED", "interrupted");

      if (agentStop) {
        aliases.push(`agent:${agentStop}`);
        set(ev("AGENT", "unknown", `agent stopped: ${agentStop}`, {}, { cls: agentStop, id: "-" }));
      } else {
        // ---------- EXPORT (7.7)
        let notes = "";
        await timed("export", async () => {
          const stream = new PassThrough();
          let stderr = "";
          const exitP = runSandbox(sctx, {
            role: "export", volume: vol, volumeReadonly: true, network: "none", env: { phase: "none" },
            cmd: ["tar", "-C", "/m/work", "--numeric-owner", "--exclude=./node_modules", "-cf", "-", "."], timeoutMs: 600_000,
            onStdout: (c) => stream.write(c), onStderr: (c) => (stderr += c.toString("utf8")),
          }).then((r) => {
            stream.end();
            return { code: r.timedOut ? 124 : r.exitCode, stderr };
          });
          const res = await exportChangeset({ runId, mirrorPath, baseSha: contract.base_commit, tar: stream, tarExit: exitP, limits: contract.security, tmpRoot });
          await exitP;
          notes = (await safeReadVolume(sctx, { volume: vol, file: "/m/out/notes.txt", limit: 1048576, role: "export" }))?.toString("utf8") ?? "";
          if (notes.length > 0) await w.text("notes.txt", notes);
          if (!res.result.ok) {
            await w.text("export/rejection.json", res.result);
            for (const r of res.result.reasons) aliases.push(`export:${r.code}`);
            const first = res.result.reasons[0];
            set(ev("EXPORT", "fail", `export refused: ${res.result.reasons.map((r) => r.code).join(", ")}`, { reasons: res.result.reasons }, { cls: first?.code ?? "-", id: first?.path ?? "-" }));
            out(`[export]    refused: ${res.result.reasons.map((r) => `${r.code} ${r.path}`).join(", ")}`);
            return;
          }
          exportResult = res.result;
          diffPatch = "diffPatch" in res ? res.diffPatch : Buffer.alloc(0);
          set(ev("EXPORT", "pass", `${res.result.files.length} file(s) changed`, { files: res.result.files.length }));
          // 3b CANARY in memory, before any write (D-031, D-071)
          const c = canaryCheck({ diffPatch: (diffPatch as Buffer).toString("utf8"), notes, canary, token });
          set(c.evidence);
          for (const h of c.security) sec({ kind: h.kind, severity: h.severity, detail: h.detail, source: "export" });
          await w.text("export/changeset.json", res.result);
          if (c.diffHasSecret) {
            const red = createRedactor({ exactSecrets: [canary, token] });
            w.raw("export/diff.redacted.patch", red.redactText((diffPatch as Buffer).toString("utf8")).text);
          } else {
            w.raw("export/diff.patch", diffPatch as Buffer);
          }
          // 5 INTEGRITY
          const rc = await (x.recompute ?? recomputeTreeSha)({ mirrorPath, baseSha: contract.base_commit, diffPatch: diffPatch as Buffer, tmpRoot });
          if ("treeSha" in rc && rc.treeSha === res.result.tree_sha) {
            integrity = "ok";
            set(ev("INTEGRITY", "pass", "recomputed tree matches"));
          } else {
            integrity = "mismatch";
            const why = "error" in rc ? "apply_failed" : "mismatch";
            set(ev("INTEGRITY", "unknown", `integrity ${why}`, {}, { cls: why, id: "-" }));
            sec({ kind: "tree_mismatch", severity: "incident", detail: why === "apply_failed" ? { reason: "apply_failed" } : { reason: "mismatch" }, source: "worker" });
          }
          out(`[export]    ${res.result.files.length} file(s) changed · tree ${res.result.tree_sha.slice(0, 7)} · diff ${res.result.diff_bytes} B`);
        });
        await dockerText(docker, ["volume", "rm", "-f", vol], 60_000);

        // ---------- VERIFY (7.8)
        const ex = exportResult as ChangesetExport | null;
        if (ex && evd.get("INTEGRITY")?.status === "pass" && evd.get("CANARY")?.status === "pass") {
          await timed("verify", async () => {
            const redactReport = (raw: string | null): string => (raw === null ? "" : raw.includes(canary) || raw.includes(token) ? JSON.stringify({ redacted: true }) : raw);
            try {
              const r = await verifyTrees({
                docker, runId, runDir, mandatHome: i.home, home: os.homedir(), images, infraUser: user, ...(host.extraCa ? { extraCa: host.extraCa } : {}), ipv6Sysctl,
                mirrorPath, baseSha: contract.base_commit, baseDir, diffPatch: diffPatch as Buffer, files: ex.files, rc: contract.repo_config,
                allowedPaths: contract.allowed_paths, mayChangeTests: contract.may_change_tests, mustPass: contract.must_pass, external: false, tmpRoot,
                startGate, ...(x.runTests ? { runTests: x.runTests } : {}),
                onReports: async (a, b) => {
                  w.raw("verify/report-a.json", redactReport(a.raw));
                  w.raw("verify/report-b.json", redactReport(b.raw));
                  await w.text("verify/exits.json", { a: a.exit, b: b.exit });
                },
                onSecurity: (h) => sec({ kind: h.kind, severity: h.severity, detail: h.detail, source: "worker" }),
                onGateLog: (tree, file) => gateLogs.push({ tree, file }),
                progress: out,
              });
              for (const e of r.evidence) set(e);
            } catch (e) {
              if (e instanceof VerifyInfraError) infra(e.code, e.message);
              throw e;
            }
          });
          // 6) R6: recompute again from the diff.patch on disk before the verdict (D-074, D-126)
          if (i.hooks?.beforeVerdict) await i.hooks.beforeVerdict(runDir);
          const onDisk = path.join(runDir, "export", "diff.patch");
          if (existsSync(onDisk) && ex) {
            const again = await (x.recompute ?? recomputeTreeSha)({ mirrorPath, baseSha: contract.base_commit, diffPatch: readFileSync(onDisk), tmpRoot });
            if (!("treeSha" in again) || again.treeSha !== ex.tree_sha) {
              const why = "error" in again ? "apply_failed" : "mismatch";
              integrity = "mismatch";
              set(ev("INTEGRITY", "unknown", `integrity ${why} after verify`, {}, { cls: why, id: "post_verify" }));
              sec({ kind: "tree_mismatch", severity: "incident", detail: { reason: why, when: "post_verify" }, source: "worker" });
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof InfraError) infraCode = e.code;
      else if (e instanceof MandatError) infraCode = e.code;
      else {
        infraCode = "E_DOCKER";
        process.stderr.write(`internal error: ${(e as Error).message}\n`);
      }
      if (interrupted) infraCode = "E_INTERRUPTED";
    } finally {
      if (gate) await (gate as RunGate).stop().catch(() => undefined);
      // gate logs → security events (D-042, D-081): aggregate blocks by (kind, qname | method+path)
      const agg = new Map<string, { line: GateLogLine; tree: string; count: number }>();
      for (const g of gateLogs) {
        for (const l of readGateLog(g.file)) {
          if (l.kind !== "proxy_block" && l.kind !== "dns_block") continue;
          const k = `${g.tree}|${l.kind}|${l.kind === "dns_block" ? l.qname : `${l.method} ${l.path}`}`;
          const cur = agg.get(k);
          if (cur) cur.count++;
          else agg.set(k, { line: l, tree: g.tree, count: 1 });
        }
      }
      for (const { line, tree, count } of agg.values()) {
        const detail: SecurityEvent["detail"] = line.kind === "dns_block" ? { qname: line.qname ?? "", qtype: line.qtype ?? 0, count } : { method: line.method ?? "", path: line.path ?? "", count };
        if (tree !== "agent") detail.tree = tree;
        sec({ kind: line.kind as "proxy_block" | "dns_block", severity: "warn", detail, source: "gate" });
      }
    }

    // ---------- VERDICT (7.9)
    const s = Date.now();
    if (infraCode) {
      aliases.push(`infra:${infraCode.replace(/^E_/, "").toLowerCase()}`);
      set(ev("INFRA", "unknown", `infra: ${infraCode}`, {}, { cls: infraCode.replace(/^E_/, ""), id: "-" }));
    }
    const ORDER = ["EXPORT", "INTEGRITY", "D10.lockfile", "D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "MUST_PASS", "D11.mutation", "CANARY"] as const;
    const evidence: Evidence[] = ORDER.map((d) => evd.get(d) ?? na(d));
    for (const extra of ["AGENT", "INFRA"] as const) {
      const e = evd.get(extra);
      if (e) evidence.push(e);
    }
    const result = decideVerdict(evidence);
    timings.verdict = Date.now() - s;
    timings.total = Date.now() - t0;
    const ex = exportResult as ChangesetExport | null;
    const verdict = Verdict.parse({
      run_id: runId, task_id: contract.task_id, attempt: 1, agent: adapter.id, result, reasons: buildReasons(evidence, aliases), evidence,
      contract_hash: contract.contract_hash, base_sha: contract.base_commit, tree_sha: ex?.tree_sha ?? null,
      diff_hash: diffPatch ? sha256Tag(diffPatch) : null, integrity,
      usage: { usd: usage.usd, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, requests: usage.requests },
      timings_ms: timings, created_at: now().toISOString(),
    });
    const red = w.r.redactJson(verdict).value as Verdict;
    await w.text("verdict.json", red);
    await w.text("timings.json", timings);
    w.ledger("verdict", contract.task_id, { run_id: runId, result: red.result, reasons: red.reasons, verdict_hash: hashJcs(red) });
    const totalHits = Object.values(w.hits).reduce((a, b) => a + b, 0);
    if (totalHits > 0) sec({ kind: "redaction_hit", severity: "info", detail: { ...w.hits }, source: "worker" });

    // ---------- cleanup (7.10)
    const ps = await dockerText(docker, ["ps", "-aq", "--filter", `label=mandat.run=${runId}`]);
    for (const c of ps.stdout.split("\n").filter(Boolean)) await dockerText(docker, ["rm", "-f", c]);
    for (const t of ["agent", "base", "a", "b"] as const) await dockerText(docker, ["network", "rm", names.net(runId, t)]);
    if (!i.keep) for (const t of ["agent", "base", "a", "b"] as const) await dockerText(docker, ["volume", "rm", "-f", names.vol(runId, t)]);
    rmSync(tmpRoot, { recursive: true, force: true });

    const exit = infraCode === "E_INTERRUPTED" ? 130 : infraCode ? 3 : result === "VERIFIED" ? 0 : result === "UNKNOWN" ? 10 : 20;
    return {
      verdict: red, exit, runDir, agentExit,
      ledger: w.ledgerFrom !== null && w.ledgerTo !== null ? { from: w.ledgerFrom, to: w.ledgerTo } : null,
      ...(usage.limit ? { limit: usage.limit } : {}),
      ...(usage.authFailed ? { authFailed: true } : {}),
      ...(asks.length > 0 ? { asks } : {}),
    };
  } finally {
    process.off("SIGINT", onSigint);
    release();
  }
}
