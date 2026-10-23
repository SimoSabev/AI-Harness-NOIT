import { JOB_LINES, SYSTEM_JOB_ARGV, SystemJob, jobLines } from "@mandat/contract";
import type { JobState } from "@mandat/contract";

// D-370: the CLI commands of `mandat local` from the web (page System). The web names a job from a closed list; the
// argv is fixed here (the only value filled in is the local org for verify-log). One run per kind at a time; the page
// sees the last lines of the output and, for `--json` commands, the parsed result.
export type JobRun = (argv: readonly string[], o: { stdout(s: string): void; stderr(s: string): void; exit(code: number): void }) => void;

export interface SystemJobsDeps {
  run: JobRun;
  org: string;
  now?: () => Date;
}

const MAX_STDOUT = 1024 * 1024;
const idle = (job: SystemJob): JobState => ({ job, state: "idle", started_at: null, finished_at: null, exit: null, lines: [], result: null });

export class SystemJobs {
  private readonly jobs = new Map<SystemJob, JobState>();

  constructor(private readonly d: SystemJobsDeps) {}

  state(job: SystemJob): JobState {
    return this.jobs.get(job) ?? idle(job);
  }

  all(): JobState[] {
    return SystemJob.options.map((j) => this.state(j));
  }

  start(job: SystemJob): JobState {
    const cur = this.state(job);
    if (cur.state === "running") return cur;
    const now = () => (this.d.now ?? (() => new Date()))().toISOString();
    const s: JobState = { ...idle(job), state: "running", started_at: now() };
    this.jobs.set(job, s);
    const steps = SYSTEM_JOB_ARGV[job].map((argv) => argv.map((a) => (a === "{org}" ? this.d.org : a)));
    let stdout = "";
    const push = (chunk: string) => {
      s.lines = [...s.lines, ...jobLines(chunk)].slice(-JOB_LINES);
    };
    const finish = (code: number | null) => {
      let result: unknown;
      try {
        result = stdout.trim().startsWith("{") ? JSON.parse(stdout.trim()) : null;
      } catch {
        result = null;
      }
      Object.assign(s, { state: code === 0 ? "ok" : "failed", exit: code, finished_at: now(), result });
    };
    const step = (i: number) => {
      const argv = steps[i];
      if (!argv) return finish(0);
      stdout = "";
      const json = argv.includes("--json"); // its stdout is the result, not output to show
      try {
        this.d.run(argv, {
          stdout: (c) => {
            stdout = (stdout + c).slice(-MAX_STDOUT);
            if (!json) push(c);
          },
          stderr: push,
          exit: (code) => (code === 0 ? step(i + 1) : finish(code)),
        });
      } catch {
        finish(null);
      }
    };
    step(0);
    return s;
  }
}
