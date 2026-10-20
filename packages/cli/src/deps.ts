import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { realDockerRunner } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import type { SqlClient } from "@mandat/ledger";

/** Everything the CLI touches outside the process; tests replace it (fake runner, fake healthz). */
export interface CliDeps {
  docker: DockerRunner;
  healthz(port: number): Promise<{ ok: boolean; status: number | null }>;
  procVersion(): string;
  toolVersion(cmd: "git" | "pnpm"): Promise<string | null>;
  nodeVersion: string;
  /** tests: a fake ledger database for `verify-log --org <uuid>` */
  db?: SqlClient & { end?: () => Promise<void> };
}

export function realDeps(): CliDeps {
  return {
    docker: realDockerRunner(),
    async healthz(port) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) });
        return { ok: r.status === 200, status: r.status };
      } catch {
        return { ok: false, status: null };
      }
    },
    procVersion() {
      try {
        return readFileSync("/proc/version", "utf8");
      } catch {
        return "";
      }
    },
    toolVersion(cmd) {
      return new Promise((resolve) => {
        execFile(cmd, cmd === "git" ? ["--version"] : ["-v"], { timeout: 10_000 }, (err, stdout) => {
          if (err) return resolve(null);
          const m = /(\d+\.\d+\.\d+)/.exec(stdout);
          resolve(m ? (m[1] ?? null) : null);
        });
      });
    },
    nodeVersion: process.versions.node,
  };
}
