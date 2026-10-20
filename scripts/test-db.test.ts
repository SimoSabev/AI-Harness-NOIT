import { describe, expect, it } from "vitest";
import { runDbTests, tapLines } from "./test-db.mjs";

// D-274: pgTAP files of supabase/tests on PGlite (+ shim). Each file: plan == passed, no `not ok`.
describe("supabase/tests (pgTAP on PGlite)", () => {
  it("tapLines", () => {
    expect(tapLines([{ rows: [{ plan: "1..2" }] }, { rows: [{ ok: "ok 1 - a" }, { x: 3 }] }, { rows: [{ ok: "not ok 2 - b" }] }])).toEqual(["1..2", "ok 1 - a", "not ok 2 - b"]);
  });
  it("всички файлове са зелени", async () => {
    const r = await runDbTests();
    expect(r.map((x) => x.file)).toEqual(["ledger_append.test.sql", "outbox_approvals.test.sql", "rls_matrix.test.sql"]);
    for (const f of r) expect({ file: f.file, ok: f.ok, failed: f.failed, error: f.error }).toEqual({ file: f.file, ok: true, failed: [], error: null });
  }, 120_000);
});
