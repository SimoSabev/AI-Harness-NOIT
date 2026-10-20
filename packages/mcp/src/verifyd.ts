import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import type { Server } from "node:net";
import path from "node:path";
import type { Allowed } from "./args.js";
import { handleRequest } from "./backend.js";
import type { JobRunner } from "./jobs.js";

// Демо промпт т. 7.3: mandat-verifyd — a separate OS user, a Unix socket (0660, group mandat-clients), one JSON line
// per request. Only verify/status/explain; nothing about levels, policy, detectors or paths in its MANDAT_HOME.
export function startVerifyd(o: { socket: string; runner: JobRunner; allowed: Allowed[]; mode?: number }): Promise<Server> {
  mkdirSync(path.dirname(o.socket), { recursive: true });
  if (existsSync(o.socket)) rmSync(o.socket, { force: true });
  const srv = createServer((c) => {
    let buf = "";
    c.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      if (buf.length > 65536) {
        c.end(JSON.stringify({ ok: false, error: "too large" }) + "\n");
        return;
      }
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      let req: unknown;
      try {
        req = JSON.parse(buf.slice(0, nl));
      } catch {
        c.end(JSON.stringify({ ok: false, error: "bad json" }) + "\n");
        return;
      }
      void handleRequest(o.runner, o.allowed, req).then((r) => c.end(JSON.stringify(r) + "\n"));
    });
    c.on("error", () => undefined);
  });
  return new Promise((resolve) =>
    srv.listen(o.socket, () => {
      chmodSync(o.socket, o.mode ?? 0o660);
      resolve(srv);
    }),
  );
}
