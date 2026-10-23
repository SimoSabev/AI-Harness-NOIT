import { describe, expect, it } from "vitest";
import { createInboxWatcher, inboxStep, notificationFor } from "./inbox-watch.js";

// E9g A2 (AC-12.5): main reads the web's existing GET /api/inbox for the tray counter, the badge and the
// "waiting for you" notifications. Pure parts first, then the watcher with a fake fetch.
const item = (id: string, text = `task ${id}`) => ({ id, text });

describe("inbox step", () => {
  it("the first read sets the count and notifies nothing (no burst at start)", () => {
    expect(inboxStep(null, { items: [item("t_1"), item("t_2")] })).toEqual({ count: 2, fresh: [], ids: new Set(["t_1", "t_2"]) });
  });
  it("later reads notify only the items not seen before", () => {
    const r = inboxStep(new Set(["t_1"]), { items: [item("t_1"), item("t_3")] });
    expect(r.count).toBe(2);
    expect(r.fresh).toEqual([item("t_3")]);
  });
});

describe("the notification", () => {
  it("one new item: its text, and the click opens its card", () => {
    expect(notificationFor("en", [item("t_9", "fix the cart total")], false)).toEqual({ title: "Waiting for you", body: "fix the cart total", task_id: "t_9" });
  });
  it("long texts are cut to one line of 200 characters", () => {
    const n = notificationFor("en", [item("t_9", `${"a".repeat(300)}\nsecond line`)], false);
    expect(n?.body.length).toBeLessThanOrEqual(200);
    expect(n?.body).not.toContain("\n");
  });
  it("several new items: one notification with the count; the click opens the inbox", () => {
    expect(notificationFor("bg", [item("t_1"), item("t_2")], false)).toEqual({ title: "Чака теб", body: "2 задачи чакат теб" });
  });
  it("nothing new, or the window has focus: no notification", () => {
    expect(notificationFor("en", [], false)).toBeNull();
    expect(notificationFor("en", [item("t_1")], true)).toBeNull();
  });
});

describe("the watcher", () => {
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

  it("reads <base>/api/inbox, reports the count and only the fresh items", async () => {
    const seen: { count: number; fresh: string[] }[] = [];
    const urls: string[] = [];
    const bodies = [{ items: [item("t_1")] }, { items: [item("t_1"), item("t_2")], summary: {} }];
    const w = createInboxWatcher({
      base: () => "http://127.0.0.1:3100",
      fetch: (url) => {
        urls.push(url);
        return ok(bodies.shift());
      },
      onUpdate: (count, fresh) => seen.push({ count, fresh: fresh.map((f) => f.id) }),
    });
    await w.tick();
    await w.tick();
    expect(urls).toEqual(["http://127.0.0.1:3100/api/inbox", "http://127.0.0.1:3100/api/inbox"]);
    expect(seen).toEqual([{ count: 1, fresh: [] }, { count: 2, fresh: ["t_2"] }]);
  });

  it("no base yet, an error status, a bad body or a network error: nothing is reported, nothing throws", async () => {
    const seen: number[] = [];
    const answers: (() => Promise<Response>)[] = [
      () => Promise.resolve(new Response("{}", { status: 401 })),
      () => ok({ items: [{ id: "../x", text: "" }] }),
      () => Promise.reject(new Error("ECONNREFUSED")),
      () => Promise.resolve(new Response("not json", { status: 200 })),
    ];
    let base: string | null = null;
    const w = createInboxWatcher({ base: () => base, fetch: () => (answers.shift() ?? (() => ok({ items: [] })))(), onUpdate: (c) => seen.push(c) });
    await w.tick();
    base = "http://127.0.0.1:3100";
    for (let i = 0; i < 4; i++) await w.tick();
    expect(seen).toEqual([]);
  });
});
