import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MandatError, ResearchRequest, TraceEvent } from "@mandat/contract";
import type { ResearchReport, ResearchRequestInput } from "@mandat/contract";
import { demoWorld, reportHtml, reportMarkdown, usdText } from "@mandat/research";
import { buildProfileArgs, imageTags, profileVolume } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { hostResearchEnv, reapStaleResearch, runResearchOnce } from "@mandat/worker";
import type { Db, ResearchDeps } from "@mandat/worker";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

// E9г (D-398, D-399): research from the terminal and the worker's research loop.

/** one `claude -p` call of a subscription profile in its own container (buildProfileArgs "print", D-399) */
export function profilePrintExec(docker: DockerRunner): (profile: string, argv: string[], stdin: string, signal?: AbortSignal) => Promise<string> {
  let image: string | null = null;
  return async (profile, argv, stdin) => {
    image ??= (await imageTags(repoRoot)).sandbox;
    const out: Buffer[] = [];
    const r = await docker.run(buildProfileArgs("print", { image, volume: profileVolume("claude", profile), argv }), {
      env: {},
      stdin: Readable.from([stdin]),
      timeoutMs: 300_000,
      onStdout: (c) => out.push(c),
    });
    // stderr is never read back: it may quote the prompt (AGENTS.md rule 5)
    if (r.timedOut) throw new MandatError("E_RESEARCH_MODEL", "the subscription CLI timed out");
    if (r.exitCode !== 0) throw new MandatError("E_RESEARCH_MODEL", `the subscription CLI exited ${r.exitCode}`);
    return Buffer.concat(out).toString("utf8");
  };
}

/** the worker's research side: the proxy on loopback when it runs, subscriptions through Docker */
export function researchDeps(o: { db: Db; io: Io; home: string; docker: DockerRunner; inferencePort: number; adminPort: number }): ResearchDeps {
  const secretPath = path.join(o.home, "proxy", "secret");
  return {
    db: o.db,
    log: (l) => o.io.stderr(`${l}\n`),
    envFor: async (org, req, id) => {
      const up = existsSync(secretPath) && (await fetch(`http://127.0.0.1:${o.adminPort}/healthz`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false));
      return hostResearchEnv({ db: o.db, env: o.io.env, proxy: up ? { url: `http://127.0.0.1:${o.inferencePort}`, secretPath } : null, profileExec: profilePrintExec(o.docker) }, org, req, id);
    },
  };
}

/** ≤ 2 research runs at a time on this worker (each org is also capped at 2, research.ts) */
export async function researchLoop(d: ResearchDeps, o: { once: boolean; pollMs: number; signal?: AbortSignal; slots?: number }): Promise<void> {
  await reapStaleResearch(d.db).catch(() => []);
  const loop = async () => {
    for (;;) {
      const id = await runResearchOnce(d).catch(() => null);
      if (o.once || o.signal?.aborted) return;
      if (!id) await new Promise((r) => setTimeout(r, o.pollMs));
      if (o.signal?.aborted) return;
    }
  };
  await Promise.all(Array.from({ length: o.slots ?? 2 }, loop));
}

const MARK: Record<TraceEvent["kind"], string> = { run_started: "▶", plan: "◆", model_call: "·", query: "?", results: "≡", fetch: "↓", read: "✎", reflect: "↻", claim: "✓", section: "¶", budget: "$", note: "!", run_finished: "■" };
/** one line of the live trace in the terminal */
export function traceLine(e: TraceEvent): string {
  const lane = (e.lane ?? "").padEnd(3);
  const body = (() => {
    switch (e.kind) {
      case "run_started": return `${e.depth} · ${e.goal} · ${e.routing.map((r) => `${r.role}=${r.model}`).join(" ")}`;
      case "plan": return `${e.strategy} — ${e.lanes.map((l) => `${l.id} ${l.title}`).join(" | ")}`;
      case "model_call": return `${e.role} ${e.model} ${e.purpose} ${e.input_tokens}+${e.output_tokens} tok ${usdText(e.usd)}${e.ok ? "" : " FAILED"}`;
      case "query": return `${e.provider}: ${e.query}`;
      case "results": return `${e.provider}: ${e.hits} hits (${e.new_hits} new)`;
      case "fetch": return `${e.tier} ${e.status} ${e.domain}`;
      case "read": return `${e.quotes} quotes${e.rejected ? ` (${e.rejected} rejected)` : ""} ${e.note}`;
      case "reflect": return `${e.done ? "done" : "more"}: ${e.reason}`;
      case "claim": return `${e.verdict}: ${e.text}`;
      case "section": return e.title;
      case "budget": return `${usdText(e.spent_usd)} / ${usdText(e.cap_usd)} · ${e.pages} pages · ${e.queries} queries`;
      case "note": return e.text;
      case "run_finished": return `${e.status}${e.partial ? ` (${e.partial})` : ""} · ${e.stats.pages_read} pages · ${e.stats.claims} claims · ${usdText(e.stats.usd)}`;
    }
  })();
  return `${e.at.slice(11, 19)} ${lane} ${MARK[e.kind]} ${body}`.slice(0, 220);
}

function writeReport(io: Io, r: ResearchReport, out: string | undefined, format: "html" | "md" | "json"): void {
  const text = format === "html" ? reportHtml(r) : format === "md" ? reportMarkdown(r) : JSON.stringify(r, null, 2);
  if (out) {
    writeFileSync(out, text);
    io.stdout(`${out}\n`);
  } else io.stdout(`${text}\n`);
}

/** `mandat research demo`: the recorded world, no key, no network — the trace and a report */
export async function researchDemo(io: Io, o: { out?: string; format: "html" | "md" | "json"; question?: string }): Promise<number> {
  const w = demoWorld({ delayMs: 40, emit: (e) => io.stderr(`${traceLine(e)}\n`), ...(o.question ? { req: { question: o.question } } : {}) });
  writeReport(io, await w.run(), o.out, o.format);
  return 0;
}

/** `mandat research ask`: queue in the local database, follow the trace, write the report */
export async function researchAsk(io: Io, o: { db: Pick<Db, "query">; org: string; request: ResearchRequestInput; out?: string; format: "html" | "md" | "json"; pollMs?: number; timeoutMs?: number }): Promise<number> {
  const req = ResearchRequest.safeParse(o.request);
  if (!req.success) throw new MandatError("E_USAGE", "invalid research request");
  const id = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await o.db.query("insert into public.research_questions (id, org_id, question, request, depth, goal, requested_by) values ($1, $2::uuid, $3, $4::jsonb, $5, $6, 'human')", [id, o.org, req.data.question, JSON.stringify(req.data), req.data.depth, req.data.goal]);
  io.stderr(`${id} queued; the worker runs it (pnpm local or mandat worker)\n`);
  let seq = -1;
  const end = Date.now() + (o.timeoutMs ?? 60 * 60_000);
  for (;;) {
    const ev = await o.db.query<{ seq: number; at: string; lane: string | null; kind: string; data: Record<string, unknown> }>("select seq, to_char(at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as at, lane, kind, data from public.research_events where question_id = $1 and seq > $2 order by seq", [id, seq]);
    for (const r of ev.rows) {
      seq = r.seq;
      const e = TraceEvent.safeParse({ ...r.data, seq: r.seq, at: r.at, lane: r.lane, kind: r.kind });
      if (e.success) io.stderr(`${traceLine(e.data)}\n`);
    }
    const q = (await o.db.query<{ status: string; report: unknown; error: string | null }>("select status, report, error from public.research_questions where id = $1", [id])).rows[0];
    if (q && ["done", "partial", "stopped"].includes(q.status) && q.report) {
      writeReport(io, q.report as ResearchReport, o.out, o.format);
      return q.status === "done" ? 0 : 1;
    }
    if (q?.status === "failed") {
      io.stderr(`failed: ${q.error ?? "?"}\n`);
      return 3;
    }
    if (Date.now() > end) return 3;
    await new Promise((r) => setTimeout(r, o.pollMs ?? 700));
  }
}
