import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approve } from "./actions";
import { localPresence } from "./local-auth";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, changesetOf, webDb } from "./web-db.test-helper";

// Демо промпт т. 8.1: approve-cas, approve-head-sha, approve-totp.
let db: Awaited<ReturnType<typeof webDb>>;
beforeEach(async () => (db = await webDb()));
afterEach(async () => db.end());

const counts = async () => {
  const r = await db.query<{ a: number; l: number; o: number }>("select (select count(*)::int from public.approvals) as a, (select count(*)::int from public.ledger where kind = 'approval') as l, (select count(*)::int from public.outbox) as o");
  return r.rows[0];
};
const noMfa = () => Promise.resolve(null);

describe("approve-cas", () => {
  it("две паралелни одобрения → едно; второто 409; картата излиза от „Чака теб“", async () => {
    const cs = await changesetOf(db, "t_seed_bugfix");
    const body = { head_sha: cs.head_sha, decision: "approved" as const, client: "web" as const };
    const [a, b] = await Promise.all([approve(db, { uid: U.approver, changesetId: cs.id, body, secondFactor: noMfa }), approve(db, { uid: U.owner, changesetId: cs.id, body, secondFactor: noMfa })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await counts()).toEqual({ a: 1, l: 1, o: 2 });
    const t = (await db.query<{ state: string; wait_reason: string | null }>("select state, wait_reason from public.tasks where id = 't_seed_bugfix'")).rows[0];
    expect(t).toEqual({ state: "GATED", wait_reason: null });
  });
  it("viewer → 403 без ефект", async () => {
    const cs = await changesetOf(db, "t_seed_bugfix");
    const r = await approve(db, { uid: U.viewer, changesetId: cs.id, body: { head_sha: cs.head_sha, decision: "approved", client: "web" }, secondFactor: noMfa });
    expect(r).toEqual({ status: 403, body: { error: "not_an_approver" } });
    expect(await counts()).toEqual({ a: 0, l: 0, o: 0 });
  });
  it("отказ → задачата е затворена, без outbox", async () => {
    const cs = await changesetOf(db, "t_seed_bugfix");
    const r = await approve(db, { uid: U.approver, changesetId: cs.id, body: { head_sha: cs.head_sha, decision: "rejected", reason: "не сега", client: "web" }, secondFactor: noMfa });
    expect(r.status).toBe(200);
    expect(await counts()).toEqual({ a: 1, l: 1, o: 0 });
  });
});

describe("approve-head-sha", () => {
  it("стар head_sha → 409, без ефект", async () => {
    const cs = await changesetOf(db, "t_seed_bugfix");
    const r = await approve(db, { uid: U.approver, changesetId: cs.id, body: { head_sha: "f".repeat(40), decision: "approved", client: "web" }, secondFactor: noMfa });
    expect(r).toEqual({ status: 409, body: { error: "head_sha_moved" } });
    expect(await counts()).toEqual({ a: 0, l: 0, o: 0 });
    expect((await db.query<{ state: string }>("select state from public.tasks where id = 't_seed_bugfix'")).rows[0]?.state).toBe("HELD");
  });
  it("непознат changeset → 404", async () => {
    const r = await approve(db, { uid: U.approver, changesetId: "00000000-0000-4000-8000-000000000000", body: { head_sha: "f".repeat(40), decision: "approved", client: "web" }, secondFactor: noMfa });
    expect(r.status).toBe(404);
  });
});

describe("approve-totp", () => {
  it("requires_second_factor без код → 403; грешен код → 403; верен нов код → totp", async () => {
    const cs = await changesetOf(db, "t_seed_feature");
    const body = { head_sha: cs.head_sha, decision: "approved" as const, client: "web" as const };
    const sf = devSecondFactor(db);
    expect(await approve(db, { uid: U.approver, changesetId: cs.id, body, secondFactor: sf })).toEqual({ status: 403, body: { error: "second_factor_required" } });
    expect((await approve(db, { uid: U.approver, changesetId: cs.id, body: { ...body, code: "000000" === totpAt(TEST_TOTP, Date.now()) ? "111111" : "000000" }, secondFactor: sf })).status).toBe(403);
    const ok = await approve(db, { uid: U.approver, changesetId: cs.id, body: { ...body, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(ok).toMatchObject({ status: 200, body: { method: "totp" } });
  });
  it("код, проверен преди 3 мин → отказ от тригера; нищо в approvals, ledger, outbox", async () => {
    const cs = await changesetOf(db, "t_seed_feature");
    const stale = () => Promise.resolve(new Date(Date.now() - 3 * 60_000));
    const r = await approve(db, { uid: U.approver, changesetId: cs.id, body: { head_sha: cs.head_sha, decision: "approved", client: "web", code: "123456" }, secondFactor: stale });
    expect(r).toEqual({ status: 403, body: { error: "second_factor_rejected" } });
    expect(await counts()).toEqual({ a: 0, l: 0, o: 0 });
  });
  it("грешка след INSERT (outbox ключът е зает) → няма ред в approvals, ledger и outbox", async () => {
    const cs = await changesetOf(db, "t_seed_bugfix");
    await db.query("insert into public.outbox (org_id, kind, idempotency_key, payload) select org_id, 'ready_for_review', 'ready:' || id::text || ':' || head_sha, '{}' from public.changesets where id = $1::uuid", [cs.id]);
    await expect(approve(db, { uid: U.approver, changesetId: cs.id, body: { head_sha: cs.head_sha, decision: "approved", client: "web" }, secondFactor: noMfa })).resolves.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ a: 0, l: 0, o: 1 });
    expect((await db.query<{ state: string }>("select state from public.tasks where id = 't_seed_bugfix'")).rows[0]?.state).toBe("HELD");
  });
});

describe("approve-local (D-368: pnpm local without a login)", () => {
  it("requires_second_factor + the local presence → no code, method local, recorded as local", async () => {
    const cs = await changesetOf(db, "t_seed_feature");
    const r = await approve(db, { uid: U.approver, changesetId: cs.id, body: { head_sha: cs.head_sha, decision: "approved", client: "web" }, secondFactor: localPresence });
    expect(r).toMatchObject({ status: 200, body: { method: "local" } });
    expect((await db.query<{ method: string }>("select method from public.approvals")).rows).toEqual([{ method: "local" }]);
  });
  it("the trigger: method local needs a fresh timestamp too", async () => {
    const cs = await changesetOf(db, "t_seed_feature");
    const stale = Object.assign(() => Promise.resolve(new Date(Date.now() - 3 * 60_000)), { local: true as const });
    const r = await approve(db, { uid: U.approver, changesetId: cs.id, body: { head_sha: cs.head_sha, decision: "approved", client: "web" }, secondFactor: stale });
    expect(r).toEqual({ status: 403, body: { error: "second_factor_rejected" } });
    expect(await counts()).toEqual({ a: 0, l: 0, o: 0 });
  });
});
