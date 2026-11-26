import { describe, expect, it, vi } from "vitest";
import { readLedgerOnline } from "@mandat/ledger";
import { chatModelFor } from "./conversation-host.js";
import { recordChatWindows } from "./limit-windows.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";

// D-647: a conversation on a subscription also says what is left of it (Settings → Models reads the newest per agent)
const windows = [{ id: "five_hour", minutes: 300, used: 0.3, resets_at: "2026-11-26T15:00:00.000Z", status: "allowed" as const }];

describe("recordChatWindows (D-647)", () => {
  it("one limit_windows row in the conversation's org, under its agent; an unknown conversation writes nothing", async () => {
    const db = await pgliteDb();
    await seedMinimal(db, { remoteUrl: "file:///nowhere" });
    await db.query("insert into public.conversations (id, org_id, repo_id, created_by, agent, model, budget_usd, expires_at) values ('c_win', $1::uuid, $2::uuid, $3::uuid, 'claude@lichno', 'm-1', 0.5, now() + interval '1 hour')", [DEMO_ORG_ID, DEMO_REPO_ID, DEMO_OWNER_ID]);
    await recordChatWindows(db, { conversation: "c_win", agent: "claude@lichno", windows, at: "2026-11-26T10:00:00.000Z" });
    await recordChatWindows(db, { conversation: "c_nope", agent: "claude@lichno", windows, at: "2026-11-26T10:00:00.000Z" });
    const rows = (await readLedgerOnline(db, DEMO_ORG_ID)).filter((r) => r.kind === "limit_windows");
    expect(rows.map((r) => [r.task_id, JSON.parse(r.payload_jcs ?? "{}")])).toEqual([[null, { agent: "claude@lichno", at: "2026-11-26T10:00:00.000Z", windows }]]);
  });
});

describe("chatModelFor passes the windows on (D-647)", () => {
  it("a subscription's CLI call → onWindows with the route and the windows", async () => {
    const ev = { type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { five_hour: { utilization: 0.3, resetsAt: 1795734000 } } } };
    const result = { type: "result", is_error: false, result: JSON.stringify({ say: "hi", call: null }), usage: {} };
    const profileExec = vi.fn(async () => [ev, result].map((x) => JSON.stringify(x)).join("\n"));
    const seen: [string, unknown][] = [];
    const route = { id: "c_win", agent: "claude@lichno", model: "claude-sonnet-5-5", budgetUsd: 0.5, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    const m = chatModelFor({ proxy: null, profileExec, onWindows: (r, w) => seen.push([r.id, w]) }, route);
    if (!m.ok) throw new Error(m.why);
    await m.client.complete({ system: "s", user: "u", maxTokens: 10, json: true });
    expect(seen).toEqual([["c_win", [{ id: "five_hour", minutes: 300, used: 0.3, resets_at: new Date(1795734000 * 1000).toISOString(), status: null }]]]);
  });
});
