// Fake Docker for worker unit tests (D-091): scripted answers by argv, records argv + spawn env.
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { packTree } from "@mandat/export";
import type { DockerRunner } from "@mandat/sandbox";

export interface Call {
  args: string[];
  env: Record<string, string>;
}
export interface FakeOpts {
  dockerVersion?: string;
  installExit?: number;
  agentLines?: (ctx: { token: string; canary: string }) => string[];
  agentExit?: number;
  /** returns the dir whose files are the agent's work tree at export time */
  head?: (ctx: { canary: string; token: string }) => string | Buffer;
  tarExit?: number;
  tarStderr?: string;
  notes?: (ctx: { canary: string; token: string }) => string;
  notesExit?: number;
  notesTimedOut?: boolean;
  /** what the hooks wrote to /m/out/asks.jsonl (E8g) */
  asks?: () => string;
}

export class FakeDocker implements DockerRunner {
  readonly calls: Call[] = [];
  canary = "";
  token = "";
  constructor(private readonly o: FakeOpts = {}) {}

  async run(args: string[], ro: Parameters<DockerRunner["run"]>[1]): Promise<{ exitCode: number; timedOut: boolean }> {
    this.calls.push({ args, env: ro.env });
    const out = (s: string | Buffer) => {
      const b = Buffer.isBuffer(s) ? s : Buffer.from(s);
      ro.onStdout?.(b);
      if (ro.onStdoutLine) for (const l of b.toString("utf8").split("\n")) if (l.length > 0) ro.onStdoutLine(l);
    };
    const drain = async () => {
      if (ro.stdin !== "closed") {
        for await (const _c of ro.stdin as AsyncIterable<Buffer>) {
          /* drain */
        }
      }
    };
    const a = args.join(" ");
    if (args[0] === "version") {
      out(`${this.o.dockerVersion ?? "29.9.1"}\n`);
      return { exitCode: 0, timedOut: false };
    }
    if (args[0] !== "run") return { exitCode: 0, timedOut: false };
    const imgIdx = args.findIndex((x) => x.startsWith("mandat-sandbox:"));
    const cmd = args.slice(imgIdx + 1);
    if (ro.env.ANTHROPIC_API_KEY) this.token = ro.env.ANTHROPIC_API_KEY;
    if (ro.env.AWS_SECRET_ACCESS_KEY) this.canary = ro.env.AWS_SECRET_ACCESS_KEY;
    const ctx = { canary: this.canary, token: this.token };
    if (cmd[0] === "tar" && cmd[1] === "-x") {
      await drain();
      return { exitCode: 0, timedOut: false };
    }
    if (cmd[0] === "sh" && cmd[2]?.startsWith("cat > /m/in/contract.txt")) {
      await drain();
      return { exitCode: 0, timedOut: false };
    }
    if (cmd[0] === "npm") return { exitCode: this.o.installExit ?? 0, timedOut: false };
    if (cmd[0] === "node" && cmd[1]?.startsWith("/opt/mandat/fakes/")) {
      for (const l of this.o.agentLines?.(ctx) ?? ['{"type":"system","subtype":"init","session_id":"fake","model":"fake","tools":[],"mcp_servers":[]}', '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0,"num_turns":1}']) out(l + "\n");
      return { exitCode: this.o.agentExit ?? 0, timedOut: false };
    }
    if (cmd[0] === "tar" && cmd.includes("-cf")) {
      const head = this.o.head?.(ctx);
      if (Buffer.isBuffer(head)) out(head);
      else if (head) for await (const c of packTree(head) as AsyncIterable<Buffer>) out(c);
      if (this.o.tarStderr) ro.onStderr?.(Buffer.from(this.o.tarStderr));
      return { exitCode: this.o.tarExit ?? 0, timedOut: false };
    }
    if (cmd[0] === "sh" && a.includes("/m/out/asks.jsonl")) {
      const n = this.o.asks?.() ?? "";
      if (n) out(n);
      return { exitCode: n ? 0 : 1, timedOut: false };
    }
    if (cmd[0] === "sh" && a.includes("/m/out/notes.txt")) {
      if (this.o.notesTimedOut) return { exitCode: 137, timedOut: true };
      const n = this.o.notes?.(ctx) ?? "";
      if (n) out(n);
      return { exitCode: this.o.notesExit ?? (n ? 0 : 1), timedOut: false };
    }
    return { exitCode: 0, timedOut: false };
  }
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
/** A copy of fixtures/shop to mutate as the agent's head tree. */
export function shopCopy(mutate?: (dir: string) => void): string {
  const d = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-head-")), "shop");
  cpSync(path.join(repoRoot, "fixtures", "shop"), d, { recursive: true });
  mutate?.(d);
  return d;
}
export const fixtureReport = (name: string): string => readFileSync(path.join(repoRoot, "fixtures", "vitest-reports", name), "utf8");
export { repoRoot };
