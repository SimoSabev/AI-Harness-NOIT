import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { hiddenSets, uploadHidden } from "./hidden";
import { devSecondFactor } from "./session";
import { totpAt } from "./totp";
import { TEST_TOTP, U, webDb } from "./web-db.test-helper";

// v5 E9б (5.2, D-362): a person uploads hidden tests (approve.rules + a fresh TOTP); the files go to the private table,
// the metadata and its hash are what the UI shows; the content never comes back to the browser.
let db: Awaited<ReturnType<typeof webDb>>;
const files = [{ path: "cart.spec.ts", content: "it('hidden', () => {});\n" }];
beforeAll(async () => {
  db = await webDb();
});
afterAll(() => db.end());

describe("hidden tests (D5, E9б)", () => {
  it("viewer → 403; no code → 403; bad path or too many files → 400; owner with TOTP → version 1; the list has no content", async () => {
    const sf = devSecondFactor(db);
    expect((await uploadHidden(db, { uid: U.viewer, repoId: DEMO_REPO_ID, body: { files, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(403);
    expect((await uploadHidden(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { files }, secondFactor: sf })).body).toEqual({ error: "second_factor_required" });
    expect((await uploadHidden(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { files: [{ path: "../x.spec.ts", content: "x" }], code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(400);
    expect((await uploadHidden(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { files: Array.from({ length: 201 }, (_, i) => ({ path: `t${i}.spec.ts`, content: "x" })), code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf })).status).toBe(400);
    const r = await uploadHidden(db, { uid: U.owner, repoId: DEMO_REPO_ID, body: { files, code: totpAt(TEST_TOTP, Date.now()) }, secondFactor: sf });
    expect(r).toMatchObject({ status: 201, body: { version: 1 } });
    const list = await hiddenSets(db, U.viewer, DEMO_REPO_ID);
    expect(list).toEqual([expect.objectContaining({ version: 1, files: 1, hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) })]);
    expect(JSON.stringify(list)).not.toContain("hidden");
  });
});
