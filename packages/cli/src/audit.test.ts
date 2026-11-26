import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashJcs } from "@mandat/contract";
import { appendLedgerOnline } from "@mandat/ledger";
import { pgliteDb } from "../../../apps/worker/src/online/pglite-db.test-helper.js";
import { runCli } from "./cli.js";
import { parsePeriod } from "./commands/audit.js";
import type { CliDeps } from "./deps.js";

// E10 hosted (D-704): `mandat audit export --task|--period` → JSON; `mandat verify-log --audit <file>` checks it offline.
const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const U = { ana: "a1000000-0000-4000-8000-000000000001", boris: "a1000000-0000-4000-8000-000000000002", vera: "a1000000-0000-4000-8000-000000000003", cveta: "b1000000-0000-4000-8000-000000000001" };
let db: Awaited<ReturnType<typeof pgliteDb>>;
const dir = mkdtempSync(path.join(tmpdir(), "mandat-audit-"));

async function cli(args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(["node", "mandat", ...args], { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), env: {}, cwd: dir }, { db: { query: db.query, connect: db.connect } } as unknown as CliDeps);
  return { code, stdout, stderr };
}

beforeAll(async () => {
  db = await pgliteDb();
  await db.query(`insert into auth.users (id, email) values ${Object.entries(U).map(([k, v]) => `('${v}', '${k}@x.invalid')`).join(", ")}`);
  await db.query(`insert into public.orgs (id, name) values ('${A}', 'team-a'), ('${B}', 'team-b')`);
  await db.query(`insert into public.members (org_id, user_id, role, role_id) values ('${A}', '${U.ana}', 'viewer', 'builtin:owner'), ('${A}', '${U.boris}', 'viewer', 'builtin:worker'), ('${A}', '${U.vera}', 'viewer', 'builtin:viewer'), ('${B}', '${U.cveta}', 'viewer', 'builtin:owner')`);
  await db.query(`insert into public.repos (id, org_id, provider, full_name, remote_url) values ('a2000000-0000-4000-8000-000000000001', '${A}', 'local', 'team-a/shop', 'file:///a'), ('b2000000-0000-4000-8000-000000000001', '${B}', 'local', 'team-b/shop', 'file:///b')`);
  await db.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text, created_by) values ('t_a1', '${A}', 'a2000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'fix a1', '${U.boris}'), ('t_a2', '${A}', 'a2000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'secret a2', '${U.boris}'), ('t_b1', '${B}', 'b2000000-0000-4000-8000-000000000001', 'bugfix', 'claude', 'b1', '${U.cveta}')`);
  const vh = hashJcs({ v: "a1" });
  await db.query(`insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, base_sha, verdict_hash) values ('${A}', 't_a1', 'r_01JABCDEFGHJKMNPQRSTVWXYA1', 1, 'full', 'claude', 'VERIFIED', repeat('a', 40), $1)`, [vh]);
  await appendLedgerOnline(db, { org_id: A, kind: "task_created", task_id: "t_a1", payload: { text: "fix a1" } });
  await appendLedgerOnline(db, { org_id: A, kind: "task_created", task_id: "t_a2", payload: { text: "secret a2" } });
  await appendLedgerOnline(db, { org_id: B, kind: "task_created", task_id: "t_b1", payload: { text: "b1" } });
  await appendLedgerOnline(db, { org_id: A, kind: "verdict", task_id: "t_a1", payload: { run_id: "r_01JABCDEFGHJKMNPQRSTVWXYA1", result: "VERIFIED", reasons: [], verdict_hash: vh } });
}, 60_000);
afterAll(async () => {
  await db.end?.();
});

describe("parsePeriod (D-704)", () => {
  it("a month, a day range (inclusive), or ISO/ISO", () => {
    expect(parsePeriod("2026-11")).toEqual({ from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" });
    expect(parsePeriod("2026-12")).toEqual({ from: "2026-12-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" });
    expect(parsePeriod("2026-11-01..2026-11-26")).toEqual({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-27T00:00:00.000Z" });
    expect(parsePeriod("2026-11-01T10:00:00.000Z/2026-11-01T12:00:00.000Z")).toEqual({ from: "2026-11-01T10:00:00.000Z", to: "2026-11-01T12:00:00.000Z" });
    for (const bad of ["2026", "2026-13", "2026-11-30..2026-11-01", "yesterday", "2026-02-30..2026-03-01"]) expect(() => parsePeriod(bad)).toThrow(/period/);
  });
});

describe("mandat audit export + verify-log --audit (D-704)", () => {
  it("--task (operator): the whole chain, only the task's payloads; verify-log --audit passes; the export is in the ledger", async () => {
    const r = await cli(["audit", "export", "--task", "t_a1", "--out", "a1.json"]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/audit export → a1\.json · org a0000000… · ledger 1\.\.3 · 2 included · 1 verdict/);
    const text = readFileSync(path.join(dir, "a1.json"), "utf8");
    expect(text).not.toContain("secret a2");
    expect(JSON.parse(text)).toMatchObject({ format: "mandat.audit/v1", org_id: A, generated_by: "cli", selection: { task: "t_a1" } });
    const v = await cli(["verify-log", "--audit", "a1.json"]);
    expect(v.code).toBe(0);
    expect(v.stdout).toMatch(/audit a1\.json · org a0000000-0000-4000-8000-00000000000a · 3 rows · 2 included · 1 verdict\nOK: chain intact \(seq 1\.\.3, last sha256:[0-9a-f]{12}…\); payloads and verdicts match\n/);
    const led = (await db.query<{ kind: string; payload: { by: string; selection: unknown; included: number } }>(`select kind, payload from public.ledger where org_id = '${A}' order by seq desc limit 1`)).rows[0];
    expect(led).toMatchObject({ kind: "audit_export", payload: { by: "cli", selection: { task: "t_a1" }, included: 2 } });
    expect((await cli(["verify-log", "--org", A])).code).toBe(0); // the live chain still verifies with the new row
  });
  it("--period --org: rows of the period; --json prints one line", async () => {
    const r = await cli(["audit", "export", "--period", "2000-01-01..2099-12-31", "--org", A, "--out", "p.json", "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.stdout) as { ok: boolean; file: string; included: number };
    expect(j).toMatchObject({ ok: true, file: "p.json" });
    expect(j.included).toBeGreaterThanOrEqual(3);
    expect((await cli(["verify-log", "--audit", "p.json", "--json"])).stdout).toContain('"ok":true');
  });
  it("--as <user>: a team member with ledger.export (worker) may; a viewer and another team may not", async () => {
    const ok = await cli(["audit", "export", "--task", "t_a1", "--as", U.boris, "--out", "boris.json"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, "boris.json"), "utf8"))).toMatchObject({ generated_by: U.boris });
    expect((await cli(["verify-log", "--audit", "boris.json"])).code).toBe(0);
    const viewer = await cli(["audit", "export", "--task", "t_a1", "--as", U.vera, "--out", "vera.json"]);
    expect(viewer).toMatchObject({ code: 4, stdout: "" });
    expect(viewer.stderr).toContain("not allowed: ledger.export");
    const stranger = await cli(["audit", "export", "--task", "t_a1", "--as", U.cveta, "--out", "cveta.json"]);
    expect(stranger.code).toBe(4);
    const strangerPeriod = await cli(["audit", "export", "--period", "2026-11", "--org", A, "--as", U.cveta, "--out", "cveta.json"]);
    expect(strangerPeriod.code).toBe(4);
  });
  it("a tampered file → verify-log --audit TAMPERED, exit 1; a missing file → 3; not an export → 1", async () => {
    await cli(["audit", "export", "--task", "t_a1", "--out", "t.json"]);
    const x = JSON.parse(readFileSync(path.join(dir, "t.json"), "utf8")) as { records: { verdicts: { result: string }[] }; ledger: { payload_jcs: string | null; included: boolean }[] };
    const row = x.ledger.find((l) => l.included && l.payload_jcs?.includes("VERIFIED"));
    if (row) row.payload_jcs = (row.payload_jcs ?? "").replace("VERIFIED", "FAILED__");
    writeFileSync(path.join(dir, "t.json"), JSON.stringify(x));
    const v = await cli(["verify-log", "--audit", "t.json"]);
    expect(v.code).toBe(1);
    expect(v.stdout).toMatch(/TAMPERED: seq 3 E_PAYLOAD/);
    expect((await cli(["verify-log", "--audit", "nope.json"])).code).toBe(3);
    writeFileSync(path.join(dir, "junk.json"), "{}");
    expect((await cli(["verify-log", "--audit", "junk.json"])).stdout).toContain("E_SCHEMA");
  });
  it("usage: exactly one of --task / --period; --period needs --org; an unknown task", async () => {
    expect((await cli(["audit", "export"])).code).toBe(2);
    expect((await cli(["audit", "export", "--task", "t_a1", "--period", "2026-11", "--org", A])).code).toBe(2);
    expect((await cli(["audit", "export", "--period", "2026-11"])).code).toBe(2);
    expect((await cli(["audit", "export", "--task", "t_nope"])).code).toBe(3);
    expect((await cli(["audit", "export", "--task", "t_a1", "--org", B])).code).toBe(2);
  });
});
