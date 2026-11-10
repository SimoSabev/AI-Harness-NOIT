import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Allowed } from "./args.js";
import { resolveRepo } from "./args.js";
import type { JobRunner } from "./jobs.js";
import { VerifydRequest } from "./protocol.js";
import type { JobStatus, VerifydResponse } from "./protocol.js";

/**
 * D-512: where verifyd listens and the client connects. POSIX: the socket path itself. Windows: Node listens only on a
 * named pipe, so the same socket path always maps to the same pipe (case-insensitive, like Windows paths).
 */
export function ipcPath(socket: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") return socket;
  const id = createHash("sha256").update(path.win32.resolve(socket).toLowerCase()).digest("hex").slice(0, 16);
  return `\\\\.\\pipe\\mandat-verifyd-${id}`;
}

// What the MCP tools talk to: verifyd over its Unix socket (isolated user), or an in-process runner (--same-uid, D-234).
export interface JobBackend {
  verify(i: { repo_path?: string; task_type: string | null }): Promise<{ ok: true; job_id: string } | { ok: false; error: string }>;
  status(job_id: string): Promise<JobStatus | { error: string }>;
  explain(job_id: string, lang: "bg" | "en"): Promise<string | { error: string }>;
}

/** Answers one verifyd request; used by the socket server and by the in-process backend. */
export async function handleRequest(runner: JobRunner, allowed: Allowed[], raw: unknown): Promise<VerifydResponse> {
  const p = VerifydRequest.safeParse(raw);
  if (!p.success) return { ok: false, error: "bad request" };
  const r = p.data;
  if (r.op === "verify") {
    const repo = resolveRepo(allowed, r.repo);
    if (!repo.ok) return { ok: false, error: repo.error };
    const root = allowed.find((a) => repo.repo === a.dir || repo.repo.startsWith(a.dir + path.sep))?.dir ?? repo.repo;
    const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-mcp-"));
    try {
      const j = await runner.verify({ repo: repo.repo, remote: repo.remote, task_type: r.task_type, allowedRoot: root, tmpHome: tmp });
      return j.ok ? { ok: true, job_id: j.job_id, status: "running", poll_after_s: 5 } : { ok: false, error: j.error };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  if (r.op === "status") {
    const s = runner.status(r.job_id);
    return s ? { ok: true, status: s } : { ok: false, error: "unknown job" };
  }
  const t = runner.explain(r.job_id, r.lang);
  return t === null ? { ok: false, error: "unknown job" } : { ok: true, text: t };
}

export function inProcessBackend(runner: JobRunner, allowed: Allowed[]): JobBackend {
  return {
    async verify(i) {
      const first = allowed[0]?.dir;
      const r = await handleRequest(runner, allowed, { op: "verify", repo: i.repo_path ?? first, task_type: i.task_type });
      return "job_id" in r ? { ok: true, job_id: r.job_id } : { ok: false, error: "error" in r ? r.error : "error" };
    },
    async status(id) {
      const r = await handleRequest(runner, allowed, { op: "status", job_id: id });
      return "status" in r && typeof r.status === "object" ? r.status : { error: "error" in r ? r.error : "error" };
    },
    async explain(id, lang) {
      const r = await handleRequest(runner, allowed, { op: "explain", job_id: id, lang });
      return "text" in r ? r.text : { error: "error" in r ? r.error : "error" };
    },
  };
}

function call(socket: string, req: unknown, timeoutMs = 10_000): Promise<VerifydResponse> {
  return new Promise((resolve) => {
    const c = createConnection(ipcPath(socket));
    let buf = "";
    const done = (v: VerifydResponse) => {
      c.destroy();
      resolve(v);
    };
    const t = setTimeout(() => done({ ok: false, error: "verifyd timeout" }), timeoutMs);
    c.on("connect", () => c.write(JSON.stringify(req) + "\n"));
    c.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        clearTimeout(t);
        try {
          done(JSON.parse(buf.slice(0, nl)) as VerifydResponse);
        } catch {
          done({ ok: false, error: "bad verifyd answer" });
        }
      }
    });
    c.on("error", () => {
      clearTimeout(t);
      done({ ok: false, error: "verifyd not reachable" });
    });
  });
}

export function socketBackend(socket: string): JobBackend {
  return {
    async verify(i) {
      const r = await call(socket, { op: "verify", repo: i.repo_path ?? "", task_type: i.task_type });
      return "job_id" in r ? { ok: true, job_id: r.job_id } : { ok: false, error: "error" in r ? r.error : "error" };
    },
    async status(id) {
      const r = await call(socket, { op: "status", job_id: id });
      return "status" in r && typeof r.status === "object" ? r.status : { error: "error" in r ? r.error : "error" };
    },
    async explain(id, lang) {
      const r = await call(socket, { op: "explain", job_id: id, lang });
      return "text" in r ? r.text : { error: "error" in r ? r.error : "error" };
    },
  };
}
