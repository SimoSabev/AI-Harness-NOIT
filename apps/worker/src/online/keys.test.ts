import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, seedMinimal } from "./seed.js";
import { pgKeyStore } from "./keys.js";

const KEY = ["sk", "ant", "api03", randomBytes(30).toString("base64url")].join("-");
let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git", ownerEmail: "o@demo.invalid" });
});
afterAll(() => db.end());

describe("Postgres key store (E7в, D-313)", () => {
  it("put seals (no key text in the row), get opens; another KEK cannot open; delete; providers", async () => {
    const kek = randomBytes(32);
    const s = pgKeyStore(db, DEMO_ORG_ID, kek);
    await s.put("anthropic", KEY);
    const row = (await db.query<{ ct: string }>("select encode(ciphertext, 'escape') as ct from private.api_keys")).rows[0];
    expect(row?.ct).not.toContain(KEY.slice(0, 16));
    expect(await s.get("anthropic")).toBe(KEY);
    expect(await pgKeyStore(db, DEMO_ORG_ID, randomBytes(32)).get("anthropic")).toBeNull();
    expect(await s.providers()).toEqual(["anthropic"]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.outbox where kind = 'proxy_restart'")).rows[0]?.n).toBe(1);
    await s.delete("anthropic");
    expect(await s.get("anthropic")).toBeNull();
  });
});
