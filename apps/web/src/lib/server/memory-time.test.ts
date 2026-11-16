import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { memoryAsOfWeb, staleMemoriesWeb } from "./memory";
import { U, webDb } from "./web-db.test-helper";

// Round 2: the memory page as of a day (replayed from the history), and the project memories that name files or
// scripts the project's main no longer has (local projects, read from the mirror).
let db: Awaited<ReturnType<typeof webDb>>;
beforeEach(async () => (db = await webDb()));
afterEach(async () => db.end());
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const tmp = mkdtempSync(path.join(os.tmpdir(), "mem-time-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const memory = async (text: string, o: { created: string; scope?: "user" | "project"; status?: string; invalid?: string | null; history?: [string, string, unknown][] }) => {
  const r = await db.query<{ id: string }>(
    "insert into public.memory_items (org_id, user_id, repo_id, scope, kind, text, status, source, created_at, invalid_at) values ($1, $2, $3, $4, 'fact', $5, $6, 'human', $7::timestamptz, $8::timestamptz) returning id::text as id",
    [DEMO_ORG_ID, o.scope === "project" ? null : U.owner, o.scope === "project" ? DEMO_REPO_ID : null, o.scope ?? "user", text, o.status ?? "active", o.created, o.invalid ?? null],
  );
  const id = r.rows[0]?.id as string;
  for (const [action, at, after] of o.history ?? []) {
    await db.query("insert into public.memory_events (org_id, item_id, action, actor, after, created_at) values ($1, $2::uuid, $3, $4, $5::jsonb, $6::timestamptz)", [DEMO_ORG_ID, id, action, `human:${U.owner}`, JSON.stringify(after), at]);
  }
  return id;
};

describe("memoryAsOfWeb (round 2)", () => {
  it("shows what was known at the end of that day, with the text of then", async () => {
    await memory("I use npm", { created: "2026-10-01T10:00:00Z", status: "invalid", invalid: "2026-11-01T10:00:00Z" });
    await memory("I use pnpm", { created: "2026-11-01T10:00:00Z", history: [["created", "2026-11-01T10:00:00Z", { text: "I use pnpm 9", status: "active" }], ["edited", "2026-11-03T10:00:00Z", { text: "I use pnpm" }]] });
    const at = async (d: string) => (await memoryAsOfWeb(db, U.owner, DEMO_ORG_ID, d)).map((m) => m.text).filter((x) => x.startsWith("I use"));
    expect(await at("2026-10-15")).toEqual(["I use npm"]);
    expect(await at("2026-11-02")).toEqual(["I use pnpm 9"]);
    expect(await at("2026-11-04")).toEqual(["I use pnpm"]);
  });
});

describe("staleMemoriesWeb (round 2)", () => {
  it("a project memory naming a file the local project's main lacks is suspect; a project not on this computer is not checked", async () => {
    const src = path.join(tmp, "shop");
    mkdirSync(path.join(src, "src"), { recursive: true });
    writeFileSync(path.join(src, "package.json"), JSON.stringify({ name: "shop", scripts: { test: "vitest run" } }));
    writeFileSync(path.join(src, "src", "cart.ts"), "export {};\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: src, env });
    execFileSync("git", ["add", "-A"], { cwd: src, env });
    execFileSync("git", ["commit", "-q", "-m", "x"], { cwd: src, env });
    const mirror = path.join(tmp, "shop.git");
    execFileSync("git", ["clone", "-q", "--bare", src, mirror], { env });
    await db.query("update public.repos set remote_url = $2 where id = $1", [DEMO_REPO_ID, `file://${mirror}`]);
    const ok = await memory("the cart is in src/cart.ts", { created: "2026-11-01T10:00:00Z", scope: "project" });
    const gone = await memory("money helpers live in src/money.ts; run `pnpm typecheck`", { created: "2026-11-01T10:00:00Z", scope: "project" });
    const s = await staleMemoriesWeb(db, U.viewer, DEMO_ORG_ID);
    expect(s[ok]).toBeUndefined();
    expect(s[gone]).toEqual(["path:src/money.ts", "script:typecheck"]);
    await db.query("update public.repos set remote_url = 'https://github.com/o/shop.git' where id = $1", [DEMO_REPO_ID]);
    expect(await staleMemoriesWeb(db, U.viewer, DEMO_ORG_ID)).toEqual({});
  });
});
