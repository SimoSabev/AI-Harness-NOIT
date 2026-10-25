import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoProfileLayers, sealProfile } from "@mandat/contract";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { approveProfile, profileView, rollbackProfile } from "./profile";
import { localPresence } from "./local-auth";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, webDb } from "./web-db.test-helper";

let db: Awaited<ReturnType<typeof webDb>>;
let org = "";
const insert = async (version: number, mutants: number) => {
  const l = demoProfileLayers();
  const p = sealProfile({ version, repo_id: DEMO_REPO_ID, layers: { ...l, g: { ...l.g, mutants } }, sources: { "a.tests.command": "package_json" }, approved_by: null, approved_at: null });
  return (await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6) returning id::text as id", [org, DEMO_REPO_ID, version, JSON.stringify(p.layers), JSON.stringify(p.sources), p.profile_hash])).rows[0]?.id as string;
};
beforeAll(async () => {
  db = await webDb();
  org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
});
afterAll(() => db.end());

describe("harness profile approve / rollback (E8б, AC-2.5)", () => {
  it("view: the latest versions with layers, sources and the compiled preview for Claude Code and Codex", async () => {
    await insert(1, 3);
    const v = await profileView(db, U.viewer, org, DEMO_REPO_ID);
    expect(v.versions.map((x) => [x.version, x.status])).toEqual([[1, "proposed"]]);
    expect(Object.keys(v.versions[0]?.layers ?? {})).toHaveLength(8);
    expect(v.preview.claude.map((f) => f.path)).toContain("claude/settings.json");
    expect(v.preview.codex.map((f) => f.path)).toContain("codex/config.toml");
  });
  it("approve: approve.rules + a fresh TOTP; approver → 403; wrong code → 403; ok → version and the repo points at it", async () => {
    const id = (await db.query<{ id: string }>("select id::text as id from public.harness_profiles where version = 1")).rows[0]?.id as string;
    const sf = devSecondFactor(db);
    expect((await approveProfile(db, { uid: U.approver, repoId: DEMO_REPO_ID, body: { profile_id: id, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(403);
    expect((await approveProfile(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { profile_id: id }, secondFactor: sf })).body).toEqual({ error: "second_factor_required" });
    const wrong = totpAt(TEST_TOTP, Date.now()) === "000000" ? "111111" : "000000";
    expect((await approveProfile(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { profile_id: id, code: wrong }, secondFactor: sf })).body).toEqual({ error: "second_factor_invalid" });
    const ok = await approveProfile(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { profile_id: id, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(ok).toEqual({ status: 200, body: { version: 1 } });
  });
  it("rollback: v2 approved, then back to v1 = a new version 3 with v1 layers", async () => {
    const sf = devSecondFactor(db);
    const id2 = await insert(2, 5);
    // a TOTP code can be used once per step; wait for the next 30 s step is not needed: the dev second factor accepts any valid code
    expect((await approveProfile(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { profile_id: id2, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(200);
    const r = await rollbackProfile(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { version: 1, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(r).toEqual({ status: 200, body: { version: 3 } });
    const v = await profileView(db, U.viewer, org, DEMO_REPO_ID);
    expect(v.versions.map((x) => [x.version, x.status])).toEqual([[3, "approved"], [2, "superseded"], [1, "superseded"]]);
    expect((v.versions[0]?.layers as { g: { mutants: number } }).g.mutants).toBe(3);
  });
  it("D-368: the local presence approves without a code", async () => {
    const id4 = await insert(4, 7);
    expect(await approveProfile(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { profile_id: id4 }, secondFactor: localPresence })).toEqual({ status: 200, body: { version: 4 } });
  });
});
