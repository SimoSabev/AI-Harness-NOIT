import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JobRunner } from "./jobs.js";
import { startVerifyd } from "./verifyd.js";

// т. 7.5 mcp-isolation (S3): verifyd's MANDAT_HOME is 0700 and owned by its user; another uid (the agent) cannot write
// there. Runs as root here (the cloud container) and drops to `nobody` with setpriv to play the agent.
const root = process.getuid?.() === 0 && spawnSync("setpriv", ["--version"]).status === 0;

describe("mcp-isolation", () => {
  it("jobs/ е 0700, сокетът е 0660; --same-uid сваля VERIFIED (виж jobs.test)", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-iso-"));
    chmodSync(home, 0o700);
    const runner = new JobRunner({ home, sameUid: false, spawnVerify: () => Promise.resolve({ code: 0, stdout: "", stderr: "" }) });
    expect(statSync(path.join(home, "jobs")).mode & 0o777).toBe(0o700);
    const sock = path.join(home, "s.sock");
    const srv = await startVerifyd({ socket: sock, runner, allowed: [] });
    expect(statSync(sock).mode & 0o777).toBe(0o660);
    await new Promise<void>((r) => srv.close(() => r()));
    expect(existsSync(path.join(home, "jobs"))).toBe(true);
  });
  // D-282: needs root + setpriv to switch uid (present in the cloud container and in CI); elsewhere docs/setup/verifyd.md step 6
  it.skipIf(!root)("друг uid (агентът) не може да пише в $MANDAT_HOME на verifyd", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-iso-"));
    chmodSync(home, 0o700);
    new JobRunner({ home, sameUid: false, spawnVerify: () => Promise.resolve({ code: 0, stdout: "", stderr: "" }) });
    const w = spawnSync("setpriv", ["--reuid=65534", "--regid=65534", "--clear-groups", "/bin/sh", "-c", `echo x > ${path.join(home, "jobs", "evil.json")}`], { encoding: "utf8" });
    expect(w.status).not.toBe(0);
    expect(w.stderr).toMatch(/Permission denied/);
    const r = spawnSync("setpriv", ["--reuid=65534", "--regid=65534", "--clear-groups", "/bin/ls", path.join(home, "jobs")], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
  });
});
