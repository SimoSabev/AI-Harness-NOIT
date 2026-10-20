import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { ulid } from "@mandat/contract";
import { API_KEY_ROUTES } from "@mandat/channels";
import { evaluateR14 } from "@mandat/core";
import type { R14Probe } from "@mandat/core";
import { mintTaskToken } from "@mandat/llm-proxy";
import { DNS_MODE, dockerText, ensureUpstreamNetwork, names, probeIpv6 } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { readGateLog, startRunGate } from "./gate.js";
import { runSandbox, safeReadVolume } from "./sandbox-exec.js";

export interface DoctorDeepResult {
  blocked: number;
  total: 8;
  probes: (R14Probe & { blocked: boolean; why: string })[];
  runDir: string;
}

/** D-048: temporary run "r_<ULID>" in runs/doctor-<ULID>/, gate phase agent, fake r14-netprobe; no ledger writes. */
export async function doctorDeep(o: {
  docker: DockerRunner;
  mandatHome: string;
  home: string;
  images: { sandbox: string; gate: string };
  infraUser: string;
  extraCa: string | undefined;
  keep: boolean;
}): Promise<DoctorDeepResult> {
  const id = ulid();
  const runId = `r_${id}`;
  const runDir = path.join(o.mandatHome, "runs", `doctor-${id}`);
  mkdirSync(runDir, { recursive: true });
  const vol = names.vol(runId, "agent");
  await ensureUpstreamNetwork(o.docker);
  const ipv6Sysctl = await probeIpv6(o.docker, o.images.sandbox);
  const ctx = { docker: o.docker, runId, runDir, mandatHome: o.mandatHome, home: o.home, image: o.images.sandbox, ipv6Sysctl };
  let gate: Awaited<ReturnType<typeof startRunGate>> | undefined;
  try {
    await dockerText(o.docker, ["volume", "create", "--label", `mandat.run=${runId}`, vol]);
    gate = await startRunGate(
      { docker: o.docker, runId, runDir, mandatHome: o.mandatHome, home: o.home, tree: "agent", gateImage: o.images.gate, user: o.infraUser, extraCa: o.extraCa },
      { phase: "agent", routes: [...API_KEY_ROUTES] },
    );
    // D-049: a well-formed token minted with an ephemeral secret (no proxy needed for the probes).
    const token = mintTaskToken(randomBytes(32), { t: "t_doctor", r: runId, a: 1, e: Math.floor(Date.now() / 1000) + 600, b: 0.01, n: randomBytes(8).toString("hex") });
    const canary = randomBytes(30).toString("base64url").slice(0, 40);
    await runSandbox(ctx, {
      role: "agent", volume: vol, network: gate.net, tree: "agent",
      env: { phase: "agent", secrets: { ANTHROPIC_API_KEY: token, AWS_SECRET_ACCESS_KEY: canary } },
      cmd: ["node", "/opt/mandat/fakes/r14-netprobe.mjs"], init: true, timeoutMs: 180_000,
    });
    await new Promise((r) => setTimeout(r, 300)); // let the gate flush its log
    const notes = (await safeReadVolume(ctx, { volume: vol, file: "/m/out/notes.txt", limit: 1048576, role: "export" }))?.toString("utf8") ?? "";
    const ev = evaluateR14(notes, readGateLog(gate.paths.log), { dnsMode: DNS_MODE });
    let raw: R14Probe[] = [];
    try {
      raw = (JSON.parse(notes) as { probes: R14Probe[] }).probes;
    } catch {
      raw = [];
    }
    const probes = ev.probes.map((p) => {
      const r = raw.find((x) => x.id === p.id) ?? { id: p.id, cmd: "", exit: -1, http_code: null, dns_status: null, dns_answers: null };
      return { ...r, blocked: p.blocked, why: p.why };
    });
    return { blocked: ev.blocked, total: 8, probes, runDir };
  } finally {
    await gate?.stop();
    await dockerText(o.docker, ["volume", "rm", "-f", vol], 60_000);
    if (!o.keep) rmSync(runDir, { recursive: true, force: true });
  }
}
