// D-087: spike harness — a temporary run (runs/spike-<ULID>, run_id r_<ULID>) with the REAL sandbox, gate and proxy,
// without the ledger. Not part of the product.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { parseStreamLine } from "@mandat/agents";
import { apiKeyChannel, API_KEY_ROUTES } from "@mandat/channels";
import { contractForAgent, parseContract, renderAgentContract, ulid } from "@mandat/contract";
import { packTree } from "@mandat/export";
import { createRedactor } from "@mandat/redaction";
import { dockerText, ensureUpstreamNetwork, imageTags, names, probeIpv6, realDockerRunner } from "@mandat/sandbox";
import { hostConfig, infraUserFor, readGateLog, runSandbox, seedHarness, startRunGate } from "@mandat/worker";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {{ seed: "readme" | "shop"; contract: string; argv: string[]; stdin: "closed" | "pipe"; budgetUsd: number;
 *   extraHosts?: string[]; extraNetworkMember?: { container: string; alias: string }; extraIn?: Record<string, string>;
 *   onStdoutLine?: (line: string, ctl: { write(s: string): void; end(): void }) => void; firstStdinLine?: string }} o
 */
export async function spikeRun(o) {
  const env = process.env;
  const host = hostConfig(env);
  const mandatHome = path.resolve(env.MANDAT_HOME ?? path.join(repoRoot, ".mandat"));
  const docker = realDockerRunner();
  const images = await imageTags(repoRoot);
  const health = await fetch(`http://127.0.0.1:${host.proxyAdminPort}/healthz`).then((r) => r.ok, () => false);
  if (!health) throw new Error("llm-proxy is not running: ANTHROPIC_API_KEY=… pnpm mandat proxy start (in a separate terminal)");
  const id = ulid();
  const runId = `r_${id}`;
  const runDir = path.join(mandatHome, "runs", `spike-${id}`);
  mkdirSync(runDir, { recursive: true });
  await ensureUpstreamNetwork(docker);
  const { user } = await infraUserFor(docker);
  const ipv6Sysctl = await probeIpv6(docker, images.sandbox);
  const ctx = { docker, runId, runDir, mandatHome, home: os.homedir(), image: images.sandbox, ipv6Sysctl };
  const vol = names.vol(runId, "agent");
  const channel = apiKeyChannel({ label: "anthropic-key-main", model: "claude-sonnet-5-5", proxyAdminUrl: `http://127.0.0.1:${host.proxyAdminPort}`, secretPath: path.join(mandatHome, "proxy", "secret") });
  const contract = parseContract(JSON.parse(readFileSync(path.join(repoRoot, o.contract), "utf8")));
  let gate;
  const events = [];
  const raw = [];
  try {
    await dockerText(docker, ["volume", "create", "--label", `mandat.run=${runId}`, vol]);
    const tree = o.seedDir ? packTree(o.seedDir) : o.seed === "shop" ? packTree(path.join(repoRoot, "fixtures", "shop")) : packTree(mkReadme());
    await runSandbox(ctx, { role: "seed", volume: vol, network: "none", env: { phase: "none" }, cmd: ["tar", "-x", "-C", "/m/work"], stdin: tree, timeoutMs: 120_000 });
    const files = { "contract.txt": renderAgentContract(contractForAgent(contract)), ...(o.extraIn ?? {}) };
    for (const [name, text] of Object.entries(files)) {
      await runSandbox(ctx, { role: "seed", user: "0:0", volume: vol, network: "none", env: { phase: "none" }, cmd: ["sh", "-c", `cat > /m/in/${name} && chmod 0444 /m/in/${name}`], stdin: Readable.from([text]), timeoutMs: 60_000 });
    }
    if (o.harnessFiles) await seedHarness(ctx, vol, o.harnessFiles); // v5 SH2: /m/in/harness (root, ro for the agent)
    gate = await startRunGate({ docker, runId, runDir, mandatHome, home: os.homedir(), tree: "agent", gateImage: images.gate, user, extraCa: host.extraCa }, { phase: "agent", routes: [...API_KEY_ROUTES] });
    if (o.extraHosts) appendFileSync(gate.paths.hosts, o.extraHosts.join("\n") + "\n");
    if (o.extraNetworkMember) {
      const m = o.extraNetworkMember;
      await dockerText(docker, ["network", "connect", "--alias", m.alias, gate.net, m.container]);
      const ip = (await dockerText(docker, ["inspect", "-f", `{{(index .NetworkSettings.Networks "${gate.net}").IPAddress}}`, m.container])).stdout.trim();
      appendFileSync(gate.paths.hosts, `${ip} ${m.alias}\n`); // only in the spike (13, S1)
    }
    const cred = await channel.issueTaskCredential({ taskId: contract.task_id, runId, attempt: 1, budgetUsd: o.budgetUsd, ttlMin: 30 });
    const r = createRedactor({ exactSecrets: [cred.token] });
    const stdin = o.stdin === "pipe" ? new PassThrough() : "closed";
    const ctl = { write: (s) => stdin !== "closed" && stdin.write(s.endsWith("\n") ? s : s + "\n"), end: () => stdin !== "closed" && stdin.end() };
    if (o.firstStdinLine) ctl.write(o.firstStdinLine);
    const t0 = Date.now();
    const res = await runSandbox(ctx, {
      role: "agent", volume: vol, network: gate.net, tree: "agent", name: names.agent(runId), init: true,
      env: { phase: "agent", secrets: { ANTHROPIC_API_KEY: cred.token, AWS_SECRET_ACCESS_KEY: randomBytes(30).toString("base64url").slice(0, 40) } },
      cmd: o.argv, stdin, timeoutMs: 10 * 60_000,
      onStdoutLine: (line) => {
        let red;
        try {
          red = JSON.stringify(r.redactJson(JSON.parse(line)).value);
        } catch {
          red = JSON.stringify({ raw: r.redactText(line).text });
        }
        raw.push(red);
        for (const e of parseStreamLine(line)) events.push({ ...e, t: Date.now() - t0 });
        o.onStdoutLine?.(line, ctl);
      },
      onStderr: (c) => process.stderr.write(r.redactText(c.toString("utf8")).text),
    });
    const usage = await channel.usage(runId).catch(() => null);
    await channel.revokeTaskCredential(runId).catch(() => undefined);
    writeFileSync(path.join(runDir, "transcript.jsonl"), raw.join("\n") + "\n");
    const gateLog = readGateLog(gate.paths.log);
    const outFiles = {};
    for (const f of o.readOut ?? []) {
      let text = "";
      await runSandbox(ctx, { role: "test", volume: vol, volumeReadonly: true, network: "none", env: { phase: "none" }, cmd: ["sh", "-c", `cat /m/out/${f} 2>/dev/null || true`], timeoutMs: 30_000, onStdout: (c) => (text += c.toString()) });
      outFiles[f] = r.redactText(text).text;
    }
    return { exit: res.exitCode, events, transcript: raw, usage, gateLog, runDir, outFiles };
  } finally {
    await gate?.stop();
    await dockerText(docker, ["volume", "rm", "-f", vol]);
    const ps = await dockerText(docker, ["ps", "-aq", "--filter", `label=mandat.run=${runId}`]);
    for (const c of ps.stdout.split("\n").filter(Boolean)) await dockerText(docker, ["rm", "-f", c]);
  }
}

function mkReadme() {
  const d = path.join(os.tmpdir(), `mandat-spike-${process.pid}`);
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, "README.md"), "# spike\n\nNothing to do here.\n");
  return d;
}
