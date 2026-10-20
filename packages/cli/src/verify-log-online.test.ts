import { describe, expect, it } from "vitest";
import { jcs, sha256Tag } from "@mandat/contract";
import type { OnlineLedgerRow, SqlClient } from "@mandat/ledger";
import { runCli } from "./cli.js";
import type { CliDeps } from "./deps.js";

const ORG = "00000000-0000-4000-8000-000000000001";
function rows(n: number): OnlineLedgerRow[] {
  const out: OnlineLedgerRow[] = [];
  for (let k = 1; k <= n; k++) {
    const payload_jcs = jcs({ k });
    const body = { org_id: ORG, seq: k, ts: "2026-10-20T00:00:00.000Z", kind: "verdict", task_id: "t_a", payload_hash: sha256Tag(payload_jcs), prev_hash: out.at(-1)?.hash ?? null };
    out.push({ ...body, seq: String(k), payload_jcs, hash: sha256Tag(jcs(body)) });
  }
  return out;
}
const db = (r: OnlineLedgerRow[] | Error): SqlClient & { end: () => Promise<void> } => ({
  query: <T>() => (r instanceof Error ? Promise.reject(r) : Promise.resolve({ rows: r as T[] })),
  end: () => Promise.resolve(),
});
async function cli(args: string[], d: SqlClient & { end?: () => Promise<void> }) {
  let stdout = "";
  let stderr = "";
  const deps = { db: d } as unknown as CliDeps;
  const code = await runCli(["node", "mandat", ...args], { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), env: {}, cwd: process.cwd() }, deps);
  return { code, stdout, stderr };
}

describe("verify-log --org <uuid> (т. 5.4)", () => {
  it("OK / TAMPERED / недостъпна база / лош org", async () => {
    const ok = await cli(["verify-log", "--org", ORG], db(rows(3)));
    expect(ok.code).toBe(0);
    expect(ok.stdout).toMatch(/OK: chain intact \(seq 1\.\.3, last sha256:[0-9a-f]{12}…\)/);
    const t = rows(3);
    (t[1] as OnlineLedgerRow).payload_jcs = '{"k":9}';
    const bad = await cli(["verify-log", "--org", ORG], db(t));
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("TAMPERED: seq 2 E_PAYLOAD");
    expect((await cli(["verify-log", "--org", ORG, "--json"], db(rows(1)))).stdout).toContain('"ok":true');
    expect((await cli(["verify-log", "--org", ORG], db([]))).stdout).toContain("OK: empty ledger");
    expect((await cli(["verify-log", "--org", ORG], db(new Error("ECONNREFUSED")))).code).toBe(3);
    expect((await cli(["verify-log", "--org", "nope"], db([]))).code).toBe(2);
  });
});

describe("demo seed (т. 5.1)", () => {
  it("--scene 2 → 2; недостъпна база → 3; с fake база → 0", async () => {
    const home = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "mandat-seed-"));
    expect((await cli(["--home", home, "demo", "seed", "--scene", "2"], db([]))).code).toBe(2);
    expect((await cli(["--home", home, "demo", "seed", "--minimal"], db(new Error("ECONNREFUSED")))).code).toBe(3);
    const fake: SqlClient = {
      query: <T>(text: string) => {
        if (text.includes("count(*)")) return Promise.resolve({ rows: [{ n: 0 }] as T[] });
        if (text.includes("ledger_append")) return Promise.resolve({ rows: rows(1) as T[] });
        return Promise.resolve({ rows: [] as T[] });
      },
    };
    const r = await cli(["--home", home, "demo", "seed", "--minimal", "--json"], fake);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ created: true, exit: 0 });
  });
  it("пълен seed (т. 8): 4 акаунта с пароли и TOTP веднъж; повторно → без пароли; --scene 1", async () => {
    const { pgliteDb } = await import("../../../apps/worker/src/online/pglite-db.test-helper.js");
    const home = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "mandat-seed-"));
    const pg = await pgliteDb();
    const keep = { query: pg.query };
    try {
      const r = await cli(["--home", home, "demo", "seed", "--json"], keep);
      expect(r.code).toBe(0);
      const out = JSON.parse(r.stdout) as { created: boolean; accounts: { email: string; password: string; totp: string | null }[] };
      expect(out.created).toBe(true);
      expect(out.accounts).toHaveLength(4);
      expect(out.accounts[1]?.totp).toMatch(/^otpauth:\/\/totp\/Mandat:approver%40demo\.mandat\.invalid\?secret=[A-Z2-7]{32}&/);
      const again = await cli(["--home", home, "demo", "seed", "--scene", "1"], keep);
      expect(again.stdout).toContain("passwords are not shown again");
      expect(again.stdout).toContain("scene 1");
      expect(again.stdout).not.toContain(out.accounts[0]?.password ?? "?");
    } finally {
      await pg.end();
    }
  });
});
