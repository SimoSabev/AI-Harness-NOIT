import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_ROUTES } from "@mandat/channels";
import { dockerText, names } from "@mandat/sandbox";
import { runSandbox, startRunGate } from "@mandat/worker";
import { cleanupRun, dockerEnv, repoRoot, tempRun } from "../../../apps/worker/src/testing.js";

let env: Awaited<ReturnType<typeof dockerEnv>>;
const run = tempRun();
const sctx = () => ({ docker: env.docker, runId: run.runId, runDir: run.runDir, mandatHome: run.mandatHome, home: run.home, image: env.images.sandbox, ipv6Sysctl: env.ipv6Sysctl });
const vol = names.vol(run.runId, "agent");

async function capture(o: Parameters<typeof runSandbox>[1]): Promise<{ exit: number; out: string }> {
  let out = "";
  const r = await runSandbox(sctx(), { ...o, onStdout: (c) => (out += c.toString()) });
  return { exit: r.exitCode, out };
}

beforeAll(async () => {
  env = await dockerEnv();
  await dockerText(env.docker, ["volume", "create", "--label", `mandat.run=${run.runId}`, vol]);
});
afterAll(async () => {
  await cleanupRun(env.docker, run.runId);
});

describe("sandbox (docker)", () => {
  it("sandbox hardening + S3(и) tmpfs exec (D-104)", async () => {
    const r = await capture({
      role: "test", volume: vol, network: "none", env: { phase: "test" }, timeoutMs: 60_000,
      cmd: ["sh", "-c", [
        "grep CapEff /proc/self/status", "id -u", "touch /etc/x 2>/dev/null; echo etc=$?", "touch /tmp/x; echo tmp=$?",
        "cat /sys/fs/cgroup/pids.max 2>/dev/null || cat /sys/fs/cgroup/pids/pids.max", "test -e /var/run/docker.sock; echo sock=$?",
        "printf '#!/bin/sh\\necho ok\\n' > /tmp/x.sh && chmod +x /tmp/x.sh && /tmp/x.sh",
        "printf '#!/bin/sh\\necho ok\\n' > /home/agent/x.sh && chmod +x /home/agent/x.sh && /home/agent/x.sh",
      ].join("; ")],
    });
    expect(r.exit).toBe(0);
    const lines = r.out.trim().split("\n");
    expect(lines[0]).toMatch(/CapEff:\s+0000000000000000/);
    expect(lines[1]).toBe("1000");
    expect(lines[2]).not.toBe("etc=0");
    expect(lines[3]).toBe("tmp=0");
    expect(lines[4]).toBe("512");
    expect(lines[5]).toBe("sock=1");
    expect(lines.slice(6)).toEqual(["ok", "ok"]);
  });

  it("S3(е): --log-driver=none + -i печата stdout", async () => {
    const r = await capture({ role: "test", volume: vol, network: "none", env: { phase: "none" }, timeoutMs: 60_000, cmd: ["echo", "hi"], stdin: process.stdin.isTTY ? "closed" : "closed" });
    expect(r.out).toBe("hi\n");
  });

  it("S3(д): нов volume наследява собствеността на /m", async () => {
    const r = await capture({ role: "test", volume: vol, network: "none", env: { phase: "none" }, timeoutMs: 60_000, cmd: ["sh", "-c", "stat -c '%u %n' /m /m/in /m/work /m/out"] });
    expect(r.out.trim().split("\n")).toEqual(["1000 /m", "0 /m/in", "1000 /m/work", "1000 /m/out"]);
  });

  it("resolv/hosts mounts (S3а) и S3(ж) порт", async () => {
    const port = await dockerText(env.docker, ["run", "--rm", "--user", "1000", env.images.gate, "cat", "/proc/sys/net/ipv4/ip_unprivileged_port_start"]);
    expect(port.stdout.trim()).toBe("0"); // → gate without --cap-add (D-034)
    const gate = await startRunGate(
      { docker: env.docker, runId: run.runId, runDir: run.runDir, mandatHome: run.mandatHome, home: run.home, tree: "agent", gateImage: env.images.gate, user: env.user, extraCa: env.host.extraCa },
      { phase: "agent", routes: [...API_KEY_ROUTES] },
    );
    try {
      const r = await capture({
        role: "agent", volume: vol, network: gate.net, tree: "agent", env: { phase: "none" }, timeoutMs: 60_000,
        cmd: ["sh", "-c", "head -1 /etc/resolv.conf; getent hosts egress-gate; echo x >> /etc/resolv.conf 2>/dev/null; echo ro=$?"],
      });
      const [ns, hosts, ro] = r.out.trim().split("\n");
      expect(ns).toBe(`nameserver ${gate.ip}`);
      expect(hosts?.split(/\s+/)[0]).toBe(gate.ip);
      expect(ro).not.toBe("ro=0");
    } finally {
      await gate.stop();
    }
  });

  it("doctor --deep (D-048): R14 8/8, без дневник, runs/doctor-* е изтрита", () => {
    const res = spawnSync("node", [path.join(repoRoot, "packages/cli/dist/main.js"), "--home", run.mandatHome, "doctor", "--deep", "--json"], { encoding: "utf8", env: process.env, timeout: 300_000 });
    const lines = res.stdout.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const j = JSON.parse(lines[0] ?? "") as { r14?: { blocked: number }; exit: number };
    expect(j.r14?.blocked).toBe(8);
    expect(existsSync(path.join(run.mandatHome, "ledger.jsonl"))).toBe(false);
    expect(existsSync(path.join(run.mandatHome, "security_events.jsonl"))).toBe(false);
    expect(readdirSync(path.join(run.mandatHome, "runs")).filter((d) => d.startsWith("doctor-"))).toEqual([]);
  });
});
