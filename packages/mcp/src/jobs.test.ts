import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inProcessBackend } from "./backend.js";
import { explain } from "./explain.js";
import { JobRunner, LIMITS } from "./jobs.js";
import type { SpawnVerify } from "./jobs.js";

// т. 7.2–7.3, 7.5 mcp-async / mcp-level-cap / mcp-isolation (same-uid part) / mcp-no-secrets (outputs), with a fake mandat-verify.
const outcome = (result: string, reasons: string[], level = 1) => JSON.stringify({ verdict: { result, reasons }, effective_level: level, level_reasons: ["external_cap"], ledger: { from: 4, to: 4 }, exit: 0 });
function repo() {
  const d = mkdtempSync(path.join(os.tmpdir(), "mandat-job-"));
  execFileSync("git", ["init", "-q", d]);
  writeFileSync(path.join(d, "a.txt"), "1\n");
  return d;
}
const until = async (f: () => boolean) => {
  for (let k = 0; k < 200 && !f(); k++) await new Promise((r) => setTimeout(r, 10));
};

describe("JobRunner", () => {
  it("mandat_verify връща веднага (< 1 s); статусът идва после; --same-uid сваля VERIFIED до UNKNOWN INFRA:same_uid", async () => {
    let release: (v: { code: number; stdout: string; stderr: string }) => void = () => undefined;
    const spawnVerify: SpawnVerify = () => new Promise((r) => (release = r));
    const r = new JobRunner({ home: mkdtempSync(path.join(os.tmpdir(), "mandat-jh-")), sameUid: true, spawnVerify });
    const d = repo();
    const be = inProcessBackend(r, [{ dir: d, remote: "file:///r.git" }]);
    const t0 = Date.now();
    const v = await be.verify({ task_type: null });
    expect(Date.now() - t0).toBeLessThan(1000);
    if (!v.ok) throw new Error("verify");
    expect(await be.status(v.job_id)).toMatchObject({ status: "running" });
    release({ code: 0, stdout: outcome("VERIFIED", []), stderr: "" });
    await until(() => r.status(v.job_id)?.status === "done");
    expect(await be.status(v.job_id)).toMatchObject({ status: "done", result: "UNKNOWN", reasons: ["INFRA:same_uid:-"], effective_level: 1, ledger_seq: 4 });
    expect(await be.explain(v.job_id, "en")).toContain("advice only");
  });
  it("FAILED остава FAILED; ниво никога над 1; explain рамкира ID-тата; изходите са без пътища на дневника и mdt_", async () => {
    const M = "D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50";
    const r = new JobRunner({ home: mkdtempSync(path.join(os.tmpdir(), "mandat-jh-")), sameUid: true, spawnVerify: () => Promise.resolve({ code: 20, stdout: outcome("FAILED", [M], 3), stderr: "" }) });
    const d = repo();
    const be = inProcessBackend(r, [{ dir: d, remote: "file:///r.git" }]);
    const v = await be.verify({ task_type: "bugfix" });
    if (!v.ok) throw new Error("verify");
    await until(() => r.status(v.job_id)?.status === "done");
    const s = await be.status(v.job_id);
    expect(s).toMatchObject({ result: "FAILED", reasons: [M], effective_level: 1 });
    const e = (await be.explain(v.job_id, "bg")) as string;
    expect(e).toContain('<untrusted author="-" association="-" source="test_id">tests/cart.spec.ts &gt; cart &gt; applies 10% over 50</untrusted>');
    expect(e).toContain("Изтрит тест не може да мине");
    const all = JSON.stringify([s, e]);
    expect(all).not.toMatch(/ledger\.jsonl|mdt_|\/var\/lib\/mandat/);
  });
  it("дедупликация (същото дърво → същият job_id), трета паралелна → busy, грешка на процеса → error", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-jh-"));
    const never: SpawnVerify = () => new Promise(() => undefined);
    const r = new JobRunner({ home, sameUid: true, spawnVerify: never });
    const [a, b, c] = [repo(), repo(), repo()];
    const allowed = [a, b, c].map((dir) => ({ dir, remote: "file:///r.git" }));
    const be = inProcessBackend(r, allowed);
    const j1 = await be.verify({ repo_path: a, task_type: null });
    const j1b = await be.verify({ repo_path: a, task_type: null });
    expect(j1).toEqual(j1b);
    expect(await be.verify({ repo_path: b, task_type: null })).toMatchObject({ ok: true });
    expect(await be.verify({ repo_path: c, task_type: null })).toEqual({ ok: false, error: "busy" });
    const e = new JobRunner({ home: mkdtempSync(path.join(os.tmpdir(), "mandat-jh-")), sameUid: false, spawnVerify: () => Promise.resolve({ code: 3, stdout: '{"error":{"code":"E_DOCKER_VERSION"},"exit":3}\n', stderr: "" }) });
    const eb = inProcessBackend(e, [{ dir: a, remote: "file:///r.git" }]);
    const je = await eb.verify({ task_type: null });
    if (!je.ok) throw new Error("x");
    await until(() => e.status(je.job_id)?.status === "error");
    expect(await eb.status(je.job_id)).toMatchObject({ status: "error", error: "E_DOCKER_VERSION" });
    expect(await eb.status("j_01JABCDEFGHJKMNPQRSTVWXYZ0")).toEqual({ error: "unknown job" });
    expect(await eb.explain("j_01JABCDEFGHJKMNPQRSTVWXYZ0", "en")).toEqual({ error: "unknown job" });
    expect(await eb.verify({ repo_path: "/etc", task_type: null })).toEqual({ ok: false, error: "repo not allowed" });
    expect(LIMITS).toMatchObject({ running: 2, perHour: 30 });
  });
  it("записите > 24 ч се трият при старт; ≤ 30/час на allowlist елемент", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-jh-"));
    let now = 1_000_000_000_000;
    const r = new JobRunner({ home, sameUid: true, spawnVerify: () => Promise.resolve({ code: 0, stdout: outcome("FAILED", []), stderr: "" }), now: () => now });
    const d = repo();
    const be = inProcessBackend(r, [{ dir: d, remote: "file:///r.git" }]);
    for (let k = 0; k < 30; k++) {
      writeFileSync(path.join(d, "a.txt"), `${k}\n`);
      now += 1000;
      const v = await be.verify({ task_type: null });
      expect(v.ok).toBe(true);
      if (v.ok) await until(() => r.status(v.job_id)?.status === "done");
    }
    writeFileSync(path.join(d, "a.txt"), "x\n");
    expect(await be.verify({ task_type: null })).toEqual({ ok: false, error: "busy" });
    now += 25 * 3600_000;
    const r2 = new JobRunner({ home, sameUid: true, spawnVerify: () => Promise.resolve({ code: 0, stdout: "", stderr: "" }), now: () => now });
    expect(await inProcessBackend(r2, [{ dir: d, remote: "file:///r.git" }]).verify({ task_type: null })).toMatchObject({ ok: true });
  });
  it("explain: непознат клас → „виж evidence“", () => {
    expect(explain({ result: "UNKNOWN", reasons: ["X9:odd:id"], lang: "bg" })).toContain("виж evidence");
    expect(explain({ result: "FAILED", reasons: ["D4:out_of_contract:src/x.ts"] })).toContain('source="path"');
  });
});
