import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeGitHub } from "@mandat/gate-github";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { deliverHarnessPr, scanForProposal } from "../../../../worker/src/online/harness";
import { approveHarness, connectRepo, harnessView } from "./harness";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, webDb } from "./web-db.test-helper";

// Демо промпт т. 8.2: harness-approve (без TOTP → 403; viewer → 403; owner + TOTP → approved + ledger) and the whole
// Поток 1 on PGlite + fakeGitHub: connect → scan → proposal with sources → approve → draft PR with AGENTS.md + footer.
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../..");
let db: Awaited<ReturnType<typeof webDb>>;
const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
let proposal = "";

beforeAll(async () => {
  db = await webDb();
  const src = mkdtempSync(path.join(os.tmpdir(), "harness-src-"));
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), src, { recursive: true, filter: (p) => !p.includes("node_modules") });
  execFileSync("rm", ["-f", path.join(src, ".mandat.yml")]); // a repo that is not yet onboarded
  const g = (...a: string[]) => execFileSync("git", a, { cwd: src, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  g("init", "-q", "-b", "main");
  g("add", "-A");
  g("commit", "-q", "-m", "shop");
  await db.query("update public.repos set remote_url = $2, provider = 'github' where id = $1", [DEMO_REPO_ID, src]);
});
afterAll(async () => db.end());

describe("harness (Поток 1)", () => {
  it("Свържи: само owner; ред harness_scan в outbox", async () => {
    expect((await connectRepo(db, { uid: U.approver, repoId: DEMO_REPO_ID })).status).toBe(403);
    expect((await connectRepo(db, { uid: U.owner, repoId: DEMO_REPO_ID })).status).toBe(202);
    expect((await db.query("select 1 from public.outbox where kind = 'harness_scan'")).rows).toHaveLength(1);
  });
  it("скенер → предложение със source + ledger config_change/proposed", async () => {
    proposal = await scanForProposal({ db, gh, ghRepo: "mandat-demo/shop" }, DEMO_REPO_ID);
    const v = await harnessView(db, U.viewer, "d0000000-0000-4000-8000-000000000001");
    const p = v.repos[0]?.proposal;
    expect(p?.status).toBe("proposed");
    expect(p?.field_sources["runtime.install"]).toBe("lockfile");
    expect(p?.yaml).toContain("install: npm ci --ignore-scripts");
    const l = await db.query<{ payload: { status: string } }>("select payload from public.ledger where kind = 'config_change'");
    expect(l.rows.map((r) => r.payload.status)).toEqual(["proposed"]);
  });
  it("без TOTP → 403; viewer/approver → 403; грешен код → 403; owner + TOTP → approved + ledger + outbox", async () => {
    const sf = devSecondFactor(db);
    const body = { proposal_id: proposal, generate: true };
    expect(await approveHarness(db, { uid: U.owner, repoId: DEMO_REPO_ID, body, secondFactor: sf })).toEqual({ status: 403, body: { error: "second_factor_required" } });
    expect((await approveHarness(db, { uid: U.viewer, repoId: DEMO_REPO_ID, body: { ...body, code: "123456" }, secondFactor: sf })).status).toBe(403);
    expect((await approveHarness(db, { uid: U.approver, repoId: DEMO_REPO_ID, body: { ...body, code: "123456" }, secondFactor: sf })).status).toBe(403);
    const wrong = totpAt(TEST_TOTP, Date.now()) === "000000" ? "111111" : "000000";
    expect((await approveHarness(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { ...body, code: wrong }, secondFactor: sf })).body).toEqual({ error: "second_factor_invalid" });
    expect((await approveHarness(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { ...body, edited_yaml: "version: 3", code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).body).toEqual({ error: "bad_yaml" });
    const ok = await approveHarness(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { ...body, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(ok.status).toBe(200);
    expect((ok.body.files as { path: string }[]).map((f) => f.path)).toEqual([".mandat.yml", "AGENTS.md", "CLAUDE.md"]);
    const l = await db.query<{ payload: { status: string } }>("select payload from public.ledger where kind = 'config_change' order by seq");
    expect(l.rows.map((r) => r.payload.status)).toEqual(["proposed", "approved"]);
    expect((await db.query("select 1 from public.outbox where kind = 'harness_pr'")).rows).toHaveLength(1);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.task_types where repo_id = $1", [DEMO_REPO_ID])).rows[0]?.n).toBeGreaterThanOrEqual(3);
    expect((await approveHarness(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { ...body, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(409);
  });
  it("PR чернова във fakeGitHub с AGENTS.md и футъра; Мандат harness/approval success, verdict skipped; повторно → същият PR", async () => {
    const pr = await deliverHarnessPr({ db, gh, ghRepo: "mandat-demo/shop" }, proposal);
    expect(pr?.number).toBeGreaterThan(0);
    const pull = [...gh.state.pulls.values()].find((p) => p.number === pr?.number);
    expect(pull?.draft).toBe(true);
    expect(pull?.head_ref).toBe(`mandat/harness-${proposal}`);
    const diff = gh.state.commits.get(pull?.head_sha ?? "")?.diff ?? "";
    expect(diff).toContain("+++ b/AGENTS.md");
    expect(diff).toMatch(/\+Generated by Mandat from \.mandat\.yml@sha256:[0-9a-f]{8} v1\. Do not edit; run mandat harness diff/);
    expect(diff).toContain("+@AGENTS.md");
    const checks = gh.state.checks.filter((c) => c.head_sha === pull?.head_sha).map((c) => `${c.name}=${c.conclusion}`).sort();
    expect(checks).toEqual(["Мандат approval=success", "Мандат harness=success", "Мандат verdict=skipped"]);
    expect((await deliverHarnessPr({ db, gh, ghRepo: "mandat-demo/shop" }, proposal))?.number).toBe(pr?.number);
  });
  it("невидими знаци в съществуващ AGENTS.md → одобрението е блокирано", async () => {
    await db.query("insert into public.harness_proposals (org_id, repo_id, status, policy_yaml, blocked) select org_id, id, 'proposed', 'version: 2', '[\"AGENTS.md: 1 invisible character(s) (U+202E)\"]' from public.repos where id = $1", [DEMO_REPO_ID]);
    const id = (await db.query<{ id: string }>("select id::text as id from public.harness_proposals where jsonb_array_length(blocked) > 0")).rows[0]?.id as string;
    const r = await approveHarness(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { proposal_id: id, generate: true, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: devSecondFactor(db) });
    expect(r).toEqual({ status: 409, body: { error: "blocked_invisible_characters" } });
  });
});
