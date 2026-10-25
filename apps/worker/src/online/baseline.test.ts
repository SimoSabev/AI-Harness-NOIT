import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ParsedReport } from "@mandat/contract";
import { fakeGitHub } from "@mandat/gate-github";
import { baselineFromRuns } from "../baseline.js";
import { harnessHandlers, scanForProposal } from "./harness.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_REPO_ID, seedMinimal } from "./seed.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const rep = (t: Record<string, "passed" | "failed">): ParsedReport => ({ valid: true, success: !Object.values(t).includes("failed"), total: Object.keys(t).length, tests: new Map(Object.entries(t)) });
const A = "tests/cart.spec.ts > cart > a";
const B = "tests/cart.spec.ts > cart > b";

describe("baselineFromRuns (E7г, D-314)", () => {
  it("two runs → counts, duration, flaky; an invalid report → error; failures → failed", () => {
    expect(baselineFromRuns([{ report: rep({ [A]: "passed", [B]: "passed" }), ms: 3000, timedOut: false }, { report: rep({ [A]: "passed", [B]: "failed" }), ms: 5000, timedOut: false }])).toEqual({ status: "failed", test_ids_count: 2, skipped: 0, duration_s: 4, report_valid: true, flaky: [B] });
    expect(baselineFromRuns([{ report: rep({ [A]: "passed" }), ms: 1000, timedOut: false }, { report: rep({ [A]: "passed" }), ms: 1000, timedOut: false }])).toMatchObject({ status: "ok", flaky: [] });
    expect(baselineFromRuns([{ report: { valid: false, error: "missing", detail: "" }, ms: 10, timedOut: false }, null])).toMatchObject({ status: "error", report_valid: false });
  });
});

let db: Awaited<ReturnType<typeof pgliteDb>>;
const src = mkdtempSync(path.join(os.tmpdir(), "baseline-src-"));
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git", ownerEmail: "o@demo.invalid" });
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), src, { recursive: true, filter: (p) => !p.includes("node_modules") });
  rmSync(path.join(src, ".mandat.yml"), { force: true });
  const g = (...a: string[]) => execFileSync("git", a, { cwd: src, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  g("init", "-q", "-b", "main");
  g("add", "-A");
  g("commit", "-q", "-m", "shop");
  await db.query("update public.repos set remote_url = $2 where id = $1", [DEMO_REPO_ID, src]);
});
afterAll(async () => db.end());

describe("baseline on connect (E7г, AC-1.2): async through the outbox", () => {
  it("the scan enqueues a baseline; the handler runs it twice and re-proposes with tests.flaky; ledger config_change baseline", async () => {
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const seen: string[] = [];
    const deps = {
      db, gh, ghRepo: "mandat-demo/shop",
      baselineRunner: (treeDir: string) => {
        seen.push(treeDir);
        return Promise.resolve(baselineFromRuns([{ report: rep({ [A]: "passed", [B]: "passed" }), ms: 2000, timedOut: false }, { report: rep({ [A]: "passed", [B]: "failed" }), ms: 2000, timedOut: false }]));
      },
    };
    const id = await scanForProposal(deps, DEMO_REPO_ID);
    const ob = await db.query<{ payload: { proposal_id: string } }>("select payload from public.outbox where kind = 'baseline'");
    expect(ob.rows.map((r) => r.payload.proposal_id)).toEqual([id]);
    await harnessHandlers(deps).baseline({ id: "1", org_id: "", kind: "baseline", payload: { proposal_id: id }, attempts: 0 } as never);
    expect(seen).toHaveLength(1);
    const p = (await db.query<{ policy_yaml: string; field_sources: Record<string, string>; scan: { baseline?: { flaky: string[] } } }>("select policy_yaml, field_sources, scan from public.harness_proposals where id = $1", [id])).rows[0];
    expect(p?.policy_yaml).toContain(B);
    expect(p?.field_sources["tests.flaky"]).toBe("baseline");
    expect(p?.scan.baseline?.flaky).toEqual([B]);
    const l = await db.query<{ payload: { status: string } }>("select payload from public.ledger where kind = 'config_change' order by seq");
    expect(l.rows.map((r) => r.payload.status)).toEqual(["proposed", "baseline"]);
  });
  it("without a runner (no Docker) the baseline step is skipped, the proposal stays as scanned", async () => {
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const id = await scanForProposal({ db, gh, ghRepo: "mandat-demo/shop" }, DEMO_REPO_ID);
    const before = (await db.query<{ policy_yaml: string }>("select policy_yaml from public.harness_proposals where id = $1", [id])).rows[0]?.policy_yaml;
    await harnessHandlers({ db, gh, ghRepo: "mandat-demo/shop" }).baseline({ id: "2", org_id: "", kind: "baseline", payload: { proposal_id: id }, attempts: 0 } as never);
    expect((await db.query<{ policy_yaml: string }>("select policy_yaml from public.harness_proposals where id = $1", [id])).rows[0]?.policy_yaml).toBe(before);
  });
});

describe("scan → a proposed harness profile (E8б, AC-2.1)", () => {
  it("the scan also stores a proposed profile version with 8 layers and the commit conventions from git history", async () => {
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    await scanForProposal({ db, gh, ghRepo: "mandat-demo/shop" }, DEMO_REPO_ID);
    const p = (await db.query<{ version: number; status: string; layers: { b: { conventions: string[] } } & Record<string, unknown> }>("select version, status, layers from public.harness_profiles where repo_id = $1 order by version desc limit 1", [DEMO_REPO_ID])).rows[0];
    expect(p?.status).toBe("proposed");
    expect(Object.keys(p?.layers ?? {}).sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(p?.layers.b.conventions.join(" ")).toContain("median change");
  });
});
