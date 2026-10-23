import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getShot } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import { taskDetail } from "./queries";
import { U, changesetOf, webDb } from "./web-db.test-helper";

// E9b (D12, D-364): the before/after screenshots of a changeset — approver+ like the diff, served as a PNG that cannot be
// read as anything else (nosniff, no scripts), only the names D12 uses.
let db: Awaited<ReturnType<typeof webDb>>;
let deps: ApiDeps;
let who: string | null = U.approver;
let cs = "";
beforeAll(async () => {
  db = await webDb();
  deps = { db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(10, 60_000) };
  cs = (await changesetOf(db, "t_seed_bugfix")).id;
  const org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.changesets where id = $1::uuid", [cs])).rows[0]?.org_id;
  await db.query("insert into public.changeset_shots (changeset_id, org_id, name, png) values ($1::uuid, $2::uuid, 'route-0.png', $3), ($1::uuid, $2::uuid, 'base-route-0.png', $4)", [cs, org, Buffer.from("\x89PNGafter", "latin1"), Buffer.from("\x89PNGbefore", "latin1")]);
});
afterAll(async () => db.end());
const get = (p: string) => new Request(`http://localhost:3000${p}`, { headers: { host: "localhost:3000" } });

describe("D12 screenshots", () => {
  it("approver gets the PNG (nosniff, no scripts, private cache); viewer and strangers get 404; bad names 400; no login 401", async () => {
    who = U.approver;
    const r = await getShot(get(`/api/changesets/${cs}/shots/route-0.png`), deps, cs, "route-0.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(r.headers.get("cache-control")).toBe("private, max-age=300");
    expect(Buffer.from(await r.arrayBuffer()).toString("latin1")).toBe("\x89PNGafter");
    expect((await getShot(get("/"), deps, cs, "../x.png")).status).toBe(400);
    expect((await getShot(get("/"), deps, "not-a-uuid", "route-0.png")).status).toBe(400);
    expect((await getShot(get("/"), deps, cs, "route-3.png")).status).toBe(404);
    who = U.viewer;
    expect((await getShot(get("/"), deps, cs, "route-0.png")).status).toBe(404);
    who = null;
    expect((await getShot(get("/"), deps, cs, "route-0.png")).status).toBe(401);
  });
  it("the task detail lists the names for an approver, none for a viewer", async () => {
    const org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.changesets where id = $1::uuid", [cs])).rows[0]?.org_id as string;
    expect((await taskDetail(db, U.approver, org, "approver", "t_seed_bugfix"))?.shots).toEqual(["base-route-0.png", "route-0.png"]);
    expect((await taskDetail(db, U.viewer, org, "viewer", "t_seed_bugfix"))?.shots).toEqual([]);
  });
});
