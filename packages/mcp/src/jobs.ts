import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ulid } from "@mandat/contract";
import { workingTreeFiles } from "@mandat/verify";
import { explain } from "./explain.js";
import type { JobStatus } from "./protocol.js";

// Демо промпт т. 7.2–7.3 (S17, D-234): jobs of mandat-verifyd. The check is the `mandat-verify` PROCESS (Apache-2.0),
// never the GPL CLI. Limits: ≤ 2 running per machine, ≤ 30/hour per allowed repo, same tree within 10 min → same job.
export const LIMITS = Object.freeze({ running: 2, perHour: 30, dedupeMs: 10 * 60_000, keepMs: 24 * 3600_000 });

interface JobRecord extends JobStatus {
  repo: string;
  key: string;
  started: number;
  pid: number | null;
  same_uid: boolean;
}

export type SpawnVerify = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export function spawnVerifyProcess(bin: string): SpawnVerify {
  return (args) =>
    new Promise((resolve) => {
      const env: Record<string, string> = {};
      for (const k of ["PATH", "HOME", "LANG", "MANDAT_EXTRA_CA_CERTS", "MANDAT_SANDBOX_APT", "DOCKER_HOST"]) {
        const v = process.env[k];
        if (v !== undefined) env[k] = v;
      }
      const c = spawn(process.execPath, [bin, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      c.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
      c.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
      c.on("close", (code) => resolve({ code: code ?? 3, stdout, stderr }));
      c.on("error", (e) => resolve({ code: 3, stdout, stderr: e.message }));
    });
}

/** Same tree = same HEAD + same file list with sizes and mtimes (read-only; nothing written in the repo). */
export async function treeFingerprint(repo: string, remote: string, tmpHome: string): Promise<string> {
  const files = await workingTreeFiles({ repo, tmpHome });
  const h = createHash("sha256").update(`${repo}\0${remote}\0`);
  let head: string;
  try {
    const ref = readFileSync(path.join(repo, ".git", "HEAD"), "utf8").trim();
    head = ref.startsWith("ref: ") ? (existsSync(path.join(repo, ".git", ref.slice(5))) ? readFileSync(path.join(repo, ".git", ref.slice(5)), "utf8").trim() : ref) : ref;
  } catch {
    head = "-";
  }
  h.update(head);
  for (const f of files) {
    const st = statSync(path.join(repo, f), { throwIfNoEntry: false });
    h.update(`\0${f}\0${st?.size ?? -1}\0${st?.mtimeMs ?? -1}`);
  }
  return h.digest("hex");
}

export class JobRunner {
  private readonly dir: string;
  constructor(
    private readonly o: { home: string; sameUid: boolean; spawnVerify: SpawnVerify; now?: () => number },
  ) {
    this.dir = path.join(o.home, "jobs");
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.purge();
  }
  private now(): number {
    return (this.o.now ?? Date.now)();
  }
  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }
  private all(): JobRecord[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as JobRecord];
        } catch {
          return [];
        }
      });
  }
  private save(j: JobRecord): void {
    writeFileSync(this.file(j.job_id), JSON.stringify(j), { mode: 0o600 });
  }
  purge(): void {
    for (const j of this.all()) if (this.now() - j.started > LIMITS.keepMs) rmSync(this.file(j.job_id), { force: true });
  }
  private alive(j: JobRecord): boolean {
    if (j.status !== "running") return false;
    if (j.pid === process.pid) return true;
    if (j.pid === null) return false;
    try {
      process.kill(j.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** Starts (or dedupes to) a job; never waits for the verdict. */
  async verify(i: { repo: string; remote: string; task_type: string | null; allowedRoot: string; tmpHome: string }): Promise<{ ok: true; job_id: string } | { ok: false; error: "busy" }> {
    const key = await treeFingerprint(i.repo, i.remote, i.tmpHome);
    const jobs = this.all();
    const same = jobs.find((j) => j.key === key && this.now() - j.started < LIMITS.dedupeMs && (j.status === "done" || this.alive(j)));
    if (same) return { ok: true, job_id: same.job_id };
    if (jobs.filter((j) => this.alive(j)).length >= LIMITS.running) return { ok: false, error: "busy" };
    if (jobs.filter((j) => (j.repo === i.allowedRoot || j.repo.startsWith(i.allowedRoot + path.sep)) && this.now() - j.started < 3600_000).length >= LIMITS.perHour) return { ok: false, error: "busy" };
    const id = `j_${ulid(this.now())}`;
    const rec: JobRecord = { job_id: id, status: "running", elapsed_s: 0, repo: i.repo, key, started: this.now(), pid: process.pid, same_uid: this.o.sameUid };
    this.save(rec);
    const args = ["--repo", i.repo, "--remote", i.remote, "--external", "--json", "--home", path.join(this.o.home, "verify"), ...(i.task_type ? ["--type", i.task_type] : [])];
    void this.o.spawnVerify(args).then((r) => this.finish(id, r)).catch((e: unknown) => this.finish(id, { code: 3, stdout: "", stderr: String(e) }));
    return { ok: true, job_id: id };
  }

  private finish(id: string, r: { code: number; stdout: string; stderr: string }): void {
    const rec = JSON.parse(readFileSync(this.file(id), "utf8")) as JobRecord;
    rec.elapsed_s = Math.round((this.now() - rec.started) / 1000);
    rec.pid = null;
    const last = r.stdout.trim().split("\n").filter(Boolean).at(-1);
    type Out = { verdict?: { result: "VERIFIED" | "FAILED" | "UNKNOWN"; reasons: string[] }; effective_level?: number; level_reasons?: string[]; ledger?: { to: number } | null; error?: { code: string } };
    let out: Out | null;
    try {
      out = last ? (JSON.parse(last) as Out) : null;
    } catch {
      out = null;
    }
    if (!out?.verdict) {
      rec.status = "error";
      rec.error = out?.error?.code ?? `mandat-verify exit ${r.code}`;
    } else {
      rec.status = "done";
      let result = out.verdict.result;
      let reasons = out.verdict.reasons;
      // D-234: without a separate OS user the check is advice; VERIFIED never shows up (FAILED stays FAILED).
      if (rec.same_uid && result === "VERIFIED") {
        result = "UNKNOWN";
        reasons = ["INFRA:same_uid:-", ...reasons];
      }
      rec.result = result;
      rec.reasons = reasons;
      rec.effective_level = Math.min(1, out.effective_level ?? 0) as 0 | 1;
      rec.level_reasons = out.level_reasons ?? [];
      rec.ledger_seq = out.ledger?.to ?? null;
    }
    this.save(rec);
  }

  status(id: string): JobStatus | null {
    if (!existsSync(this.file(id))) return null;
    const j = JSON.parse(readFileSync(this.file(id), "utf8")) as JobRecord;
    const { repo: _r, key: _k, started, pid: _p, same_uid: _s, ...pub } = j;
    if (pub.status === "running") pub.elapsed_s = Math.round((this.now() - started) / 1000);
    return pub;
  }

  explain(id: string, lang: "bg" | "en"): string | null {
    const s = this.status(id);
    if (!s) return null;
    if (s.status !== "done") return lang === "bg" ? `Задачата ${id} е ${s.status}.` : `Job ${id} is ${s.status}.`;
    return explain({ result: s.result ?? "UNKNOWN", reasons: s.reasons ?? [], lang });
  }
}
