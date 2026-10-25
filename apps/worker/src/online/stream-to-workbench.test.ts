import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStreamCtx, streamEvent } from "@mandat/contract";
import type { StreamEvent } from "@mandat/contract";
import { claudeToStream } from "@mandat/agents";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { sessionIdFor, sessionRecorder } from "./session-recorder.js";
import { workbench } from "./workbench.js";

const RUN = "r_01JABCDEFGHJKMNPQRSTVWXYZ0";
const lines = readFileSync(path.resolve(import.meta.dirname, "../../../../fixtures/stream-json/claude-synthetic-subagent.jsonl"), "utf8").split("\n").filter(Boolean);
function events(stepMs: number): { ev: StreamEvent; at: number }[] {
  let t = 0;
  const ctx = createStreamCtx(RUN, () => new Date(1_792_454_400_000 + t).toISOString());
  return lines.flatMap((l) => {
    t += stepMs;
    return claudeToStream(l, ctx, { "claude-sonnet-5-5": 200_000 }).map((ev) => ({ ev, at: t }));
  });
}

let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git", ownerEmail: "o@demo.invalid" });
});
afterAll(() => db.end());

describe("stream → workbench (E7д, AC-6.1/6.2)", () => {
  it("session ids fit the schema; a subagent gets its own stable id", () => {
    expect(sessionIdFor(RUN)).toBe("s_01jabcdefghjkmnpqrstvwxyz0");
    const sub = sessionIdFor(`${RUN}:toolu_task1`);
    expect(sub).toMatch(/^s_[a-z0-9_]{1,40}$/);
    expect(sub).toBe(sessionIdFor(`${RUN}:toolu_task1`));
    expect(sub).not.toBe(sessionIdFor(`${RUN}:toolu_task2`));
  });
  it("the synthetic Claude run → lead + subagent sessions, tool calls with decisions, the denied push, ended states", async () => {
    let now = 0;
    const rec = sessionRecorder(workbench(db, DEMO_ORG_ID), { taskId: null, repoId: DEMO_REPO_ID, agent: "claude", model: "claude-sonnet-5-5", account: null, now: () => now });
    for (const { ev, at } of events(100)) {
      now = at;
      rec.push(ev);
    }
    await rec.close();
    const s = (await db.query<{ id: string; parent_id: string | null; role: string; state: string; touching: string[]; context_pct: number | null; usd: number }>("select id, parent_id, role, state, touching, context_pct, usd::float as usd from public.agent_sessions order by role")).rows;
    expect(s.map((x) => [x.role, x.state])).toEqual([["lead", "done"], ["subagent", "done"]]);
    const lead = s.find((x) => x.role === "lead");
    expect(lead?.touching).toEqual(expect.arrayContaining(["src/cart.ts"]));
    expect(lead?.usd).toBeCloseTo(0.0421);
    expect(s.find((x) => x.role === "subagent")?.parent_id).toBe(lead?.id);
    const calls = (await db.query<{ tool: string; decision: string; summary: string }>("select tool, decision, summary from public.tool_calls order by at, tool")).rows;
    expect(calls.map((c) => [c.tool, c.decision])).toEqual(expect.arrayContaining([["Edit", "allowed"], ["Read", "allowed"], ["Bash", "denied"], ["mandat.mandat_status", "allowed"]]));
    for (const c of calls) expect(c.summary).not.toContain("mdt_abcdefghijklmnop");
    // the terminal: the stream lines of the run, in order, redacted
    const ln = (await db.query<{ seq: number; kind: string; text: string }>("select l.seq, l.kind, l.text from public.session_lines l join public.agent_sessions s on s.id = l.session_id where s.role = 'lead' order by l.seq")).rows;
    expect(ln[0]?.kind).toBe("init");
    expect(ln.at(-1)?.kind).toBe("result");
    expect(ln.map((l) => l.seq)).toEqual([...ln.map((l) => l.seq)].sort((a, b) => a - b));
    expect(ln.some((l) => l.kind === "tool_call" && l.text.includes("git push"))).toBe(true);
    for (const l of ln) expect(l.text).not.toContain("mdt_abcdefghijklmnop");
  });
  it("beats and broadcasts per session are throttled to ≤ 2/s even when the agent streams fast", async () => {
    let now = 0;
    const beats: number[] = [];
    const casts: number[] = [];
    const sink = {
      session: () => Promise.resolve(),
      beat: () => {
        beats.push(now);
        return Promise.resolve();
      },
      toolCall: () => Promise.resolve(),
      lines: () => Promise.resolve(),
      end: () => Promise.resolve(),
    };
    const rec = sessionRecorder(sink, { taskId: null, repoId: null, agent: "claude", model: "m", account: null, now: () => now, broadcast: () => {
      casts.push(now);
      return Promise.resolve();
    } });
    for (const { ev, at } of events(20)) {
      now = at;
      rec.push(ev);
    }
    await rec.close();
    const perSecond = (xs: number[]) => Math.max(0, ...[...new Set(xs.map((x) => Math.floor(x / 1000)))].map((s) => xs.filter((x) => Math.floor(x / 1000) === s).length));
    expect(beats.length).toBeGreaterThan(0);
    expect(perSecond(casts)).toBeLessThanOrEqual(2);
  });
  it("E8f: a newly touched file is written at once (the conflict check reads it), even inside the 500 ms window", async () => {
    let now = 0;
    const beats: { at: number; touching: string[] }[] = [];
    const sink = {
      session: () => Promise.resolve(),
      beat: (_id: string, b: { touching?: string[] }) => {
        beats.push({ at: now, touching: b.touching ?? [] });
        return Promise.resolve();
      },
      toolCall: () => Promise.resolve(),
      lines: () => Promise.resolve(),
      end: () => Promise.resolve(),
    };
    const touched: string[][] = [];
    const rec = sessionRecorder(sink, { taskId: null, repoId: null, agent: "claude", model: "m", account: null, now: () => now, onTouching: (f) => touched.push(f) });
    const ctx = createStreamCtx(RUN);
    rec.push(streamEvent(ctx, { kind: "init", text: "claude-sonnet-5-5" }));
    now = 100;
    rec.push(streamEvent(ctx, { kind: "tool_call", text: "Edit", tool: { kind: "builtin", name: "Edit", touching: ["src/cart.ts"], decision: null } }));
    await new Promise((r) => setTimeout(r, 10));
    expect(beats.some((b) => b.at === 100 && b.touching.includes("src/cart.ts"))).toBe(true);
    expect(touched).toEqual([["src/cart.ts"]]);
    await rec.close();
  });
});
