import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { socketBackend } from "./backend.js";
import { JobRunner } from "./jobs.js";
import { startVerifyd } from "./verifyd.js";

// т. 7.3: the socket protocol (one JSON line each way), only verify/status/explain, remote never from the client (D-281).
const d = mkdtempSync(path.join(os.tmpdir(), "mandat-vd-"));
execFileSync("git", ["init", "-q", path.join(d, "r")]);
const seen: string[][] = [];
const runner = new JobRunner({ home: path.join(d, "h"), sameUid: false, spawnVerify: (args) => (seen.push(args), Promise.resolve({ code: 0, stdout: '{"verdict":{"result":"VERIFIED","reasons":[]},"effective_level":1,"level_reasons":["external_cap"],"ledger":null}\n', stderr: "" })) });
const socket = path.join(d, "verifyd.sock");
const srv = await startVerifyd({ socket, runner, allowed: [{ dir: path.join(d, "r"), remote: "file:///trusted.git" }] });
afterAll(() => new Promise<void>((r) => srv.close(() => r())));

describe("verifyd (сокет)", () => {
  it("verify → status → explain; VERIFIED остава (отделен потребител); remote е този от конфигурацията на verifyd", async () => {
    const be = socketBackend(socket);
    const v = await be.verify({ repo_path: path.join(d, "r"), task_type: null });
    if (!v.ok) throw new Error(v.error);
    for (let k = 0; k < 100 && (runner.status(v.job_id)?.status ?? "") !== "done"; k++) await new Promise((r) => setTimeout(r, 10));
    expect(await be.status(v.job_id)).toMatchObject({ status: "done", result: "VERIFIED", effective_level: 1 });
    expect(await be.explain(v.job_id, "en")).toContain("Verdict: VERIFIED");
    expect(seen[0]).toEqual(expect.arrayContaining(["--remote", "file:///trusted.git", "--external", "--json"]));
  });
  it("непозната операция, remote от клиента, лош JSON, недостъпен сокет → грешка", async () => {
    const raw = async (line: string) => {
      const net = await import("node:net");
      return new Promise<string>((res) => {
        const c = net.createConnection(socket, () => c.write(line));
        let b = "";
        c.on("data", (x: Buffer) => (b += x.toString("utf8")));
        c.on("end", () => res(b.trim()));
      });
    };
    expect(JSON.parse(await raw('{"op":"set_level","level":3}\n'))).toEqual({ ok: false, error: "bad request" });
    expect(JSON.parse(await raw(`{"op":"verify","repo":"${path.join(d, "r")}","task_type":null,"remote":"file:///evil.git"}\n`))).toEqual({ ok: false, error: "bad request" });
    expect(JSON.parse(await raw("not json\n"))).toEqual({ ok: false, error: "bad json" });
    expect(await socketBackend(path.join(d, "none.sock")).status("j_01JABCDEFGHJKMNPQRSTVWXYZ0")).toEqual({ error: "verifyd not reachable" });
    expect(await socketBackend(socket).verify({ repo_path: "/etc", task_type: null })).toEqual({ ok: false, error: "repo not allowed" });
  });
});
