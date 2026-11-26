#!/usr/bin/env node
// Спайк RUNSC (E10, v5 т. 6.2, D-706): what this host can do for MANDAT_SANDBOX_RUNTIME=runsc|sbx, WITHOUT changing
// SANDBOX_HARDENING or the sandbox code. Read-only probe: prints one JSON object; on a host with runsc it starts two
// throwaway alpine containers with the real hardening flags under --runtime=runsc and checks (1) gVisor really runs,
// (2) a container name resolves on a user-defined network (the egress gate is reached by name), (3) the flags are accepted.
// Usage: pnpm --filter @mandat/sandbox build && node spikes/runsc-probe.mjs [--image alpine:3.22]
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const image = process.argv.includes("--image") ? process.argv[process.argv.indexOf("--image") + 1] : "alpine:3.22";
const sh = (cmd, args, timeout = 120_000) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout });
  return { code: r.status ?? (r.error ? -1 : -2), out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim().slice(0, 400) };
};

const out = { date: new Date().toISOString(), host: { platform: process.platform, arch: process.arch } };
const info = sh("docker", ["info", "--format", "{{json .Runtimes}}|{{.DefaultRuntime}}|{{.OperatingSystem}}|{{.KernelVersion}}|{{json .SecurityOptions}}"]);
if (info.code !== 0) {
  out.docker = { ok: false, err: info.err };
} else {
  const [runtimes, def, os, kernel, sec] = info.out.split("|");
  out.docker = { ok: true, runtimes: Object.keys(JSON.parse(runtimes)), default: def, os, kernel, rootless: (sec ?? "").includes("rootless") };
}
out.runsc_cli = sh("runsc", ["--version"]).code === 0;
const sbx = sh("sbx", ["version"]);
out.sbx = sbx.code === 0 ? { installed: true, version: sbx.out.split("\n")[0] } : { installed: false };

if (out.docker.ok && out.docker.runtimes.includes("runsc")) {
  const { SANDBOX_HARDENING } = await import(path.join(repo, "packages/sandbox/dist/index.js"));
  const id = randomBytes(4).toString("hex");
  const flags = SANDBOX_HARDENING.map((f) => f.replace("<run_id>", `r_spike_${id}`).replace("<role>", "spike"));
  const net = `mandat-runsc-spike-${id}`;
  sh("docker", ["network", "create", "--internal", net]);
  try {
    const dmesg = sh("docker", ["run", "--rm", "--runtime=runsc", ...flags, image, "dmesg"]);
    out.gvisor = { flags_accepted: dmesg.code === 0, starting_gvisor: dmesg.out.includes("Starting gVisor"), err: dmesg.code === 0 ? null : dmesg.err };
    sh("docker", ["run", "-d", "--name", `peer-${id}`, "--network", net, image, "sleep", "60"]);
    const dns = sh("docker", ["run", "--rm", "--runtime=runsc", "--network", net, image, "nslookup", `peer-${id}`]);
    out.gvisor.dns_by_name_on_user_network = dns.code === 0;
  } finally {
    sh("docker", ["rm", "-f", `peer-${id}`]);
    sh("docker", ["network", "rm", net]);
  }
} else {
  out.gvisor = { skipped: "no runsc runtime in `docker info` on this host" };
}
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
