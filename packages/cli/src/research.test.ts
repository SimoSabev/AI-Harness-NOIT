import { describe, expect, it } from "vitest";
import { ResearchReport, TraceEvent } from "@mandat/contract";
import { demoEnv } from "@mandat/research";
import type { DockerRunner } from "@mandat/sandbox";
import { DEMO_ORG_ID, runResearchOnce, seedMinimal } from "@mandat/worker";
import { pgliteDb } from "../../../apps/worker/src/online/pglite-db.test-helper.js";
import { profilePrintExec, researchAsk, researchDemo, researchEngine, traceLine } from "./commands/research.js";
import type { Io } from "./output.js";

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (s: string) => void out.push(s), stderr: (s: string) => void err.push(s), env: {} } as unknown as Io, out, err };
};

describe("mandat research (D-409)", () => {
  it("demo: the trace on stderr, a self-contained HTML report on stdout", async () => {
    const t = io();
    expect(await researchDemo(t.io, { format: "html" })).toBe(0);
    expect(t.out.join("")).toMatch(/^<!doctype html>/);
    expect(t.err.some((l) => l.includes("▶ standard"))).toBe(true);
    expect(t.err.at(-1)).toMatch(/■ done/);
  });
  it("a trace line per kind, short, with the lane", () => {
    const e = TraceEvent.parse({ seq: 1, at: "2026-10-26T10:00:00.000Z", lane: "l2", kind: "fetch", url: "https://a.org/x", domain: "a.org", tier: "browser", status: "blocked", http_status: 403, bytes: 0, ms: 10, source_id: null });
    expect(traceLine(e)).toBe("10:00:00 l2  ↓ browser blocked a.org");
  });
  it("a subscription call runs the profile's print container with the prompt on stdin; a non-zero exit is an error without stderr", async () => {
    const seen: { args: string[]; stdin: string }[] = [];
    const docker: DockerRunner = {
      run: async (args, o) => {
        let stdin = "";
        if (o.stdin !== "closed") for await (const c of o.stdin) stdin += String(c);
        seen.push({ args, stdin });
        o.onStdout?.(Buffer.from('{"result":"ok"}'));
        return { exitCode: seen.length === 1 ? 0 : 1, timedOut: false } as Awaited<ReturnType<DockerRunner["run"]>>;
      },
    };
    const exec = profilePrintExec(docker);
    const argv = ["claude", "-p", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--model", "m", "--system-prompt", "s"];
    expect(await exec("lichno", argv, "the prompt")).toBe('{"result":"ok"}');
    expect(seen[0]?.stdin).toBe("the prompt");
    expect(seen[0]?.args).toEqual(expect.arrayContaining(["-v", "mandat-profile-claude-lichno:/home/agent/.claude-profile"]));
    await expect(exec("lichno", argv, "x")).rejects.toThrow(/exited 1$/);
  });
  it("ask: queued in the database, followed while the worker runs it, the report written", async () => {
    const db = await pgliteDb();
    try {
      await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
      const t = io();
      const asking = researchAsk(t.io, { db, org: DEMO_ORG_ID, request: { question: "How does JCS sort keys?", depth: "standard", goal: "balanced" }, format: "json", pollMs: 20 });
      let ran: string | null = null;
      for (let i = 0; i < 50 && !ran; i++) {
        ran = await runResearchOnce({ db, envFor: async () => demoEnv(), stopPollMs: 50 });
        if (!ran) await new Promise((r) => setTimeout(r, 20));
      }
      expect(await asking).toBe(0);
      expect(ResearchReport.parse(JSON.parse(t.out.join(""))).status).toBe("done");
      expect(t.err.some((l) => l.includes("■ done"))).toBe(true);
    } finally {
      await db.end();
    }
    // a fresh PGlite with every migration takes a while on a busy machine
  }, 120_000);

  it("engine: start runs SearXNG with a fresh secret by env and waits for health; status and stop", async () => {
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    let running = "";
    const docker: DockerRunner = {
      run: async (args, o) => {
        calls.push({ args, env: o.env });
        if (args[0] === "inspect") o.onStdout?.(Buffer.from(running));
        if (args[0] === "run") running = "true";
        if (args[0] === "rm") running = "";
        return { exitCode: args[0] === "inspect" && running === "" ? 1 : 0, timedOut: false } as Awaited<ReturnType<DockerRunner["run"]>>;
      },
    };
    const t = io();
    expect(await researchEngine(t.io, docker, "start", { health: async () => true })).toBe(0);
    const run = calls.find((c) => c.args[0] === "run")!;
    expect(run.args).toEqual(expect.arrayContaining(["-p", "127.0.0.1:8888:8080", "-e", "SEARXNG_SECRET"]));
    expect(run.env.SEARXNG_SECRET).toMatch(/^[0-9a-f]{48}$/);
    expect(run.args.join(" ")).not.toContain(run.env.SEARXNG_SECRET!);
    expect(await researchEngine(t.io, docker, "start", { health: async () => true })).toBe(0);
    expect(t.out.at(-1)).toMatch(/already running/);
    expect(await researchEngine(t.io, docker, "status", { health: async () => true })).toBe(0);
    expect(await researchEngine(t.io, docker, "stop")).toBe(0);
    expect(await researchEngine(t.io, docker, "status")).toBe(1);
  });
});
