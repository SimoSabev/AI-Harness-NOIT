#!/usr/bin/env node
// D-464 (spike 04.11.2026, §6): Copilot CLI 1.0.105 has no status subcommand. This probe starts
// `copilot --headless --stdio`, sends Content-Length-framed JSON-RPC `ping` then `auth.getStatus`, and prints ONE line:
// {"isAuthenticated":…,"login":…}, never anything else from the reply (no token, host or authType). Exit 0 = answered,
// 1 = no answer within 20 s. ESM, no dependencies; installed in the image as mandat-copilot-status.
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 20_000;
const SEP = "\r\n\r\n";

export function frame(id, method, params) {
  const b = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  return `Content-Length: ${Buffer.byteLength(b)}${SEP}${b}`;
}

/** Complete framed messages from buf and the bytes left over (a partial frame). A body that is not JSON is skipped. */
export function takeMessages(buf) {
  const messages = [];
  let rest = buf;
  for (;;) {
    const h = rest.indexOf(SEP);
    if (h < 0) break;
    const m = /Content-Length: *(\d+)/i.exec(rest.subarray(0, h).toString("latin1"));
    const len = m ? Number(m[1]) : 0;
    if (rest.length < h + 4 + len) break;
    try {
      messages.push(JSON.parse(rest.subarray(h + 4, h + 4 + len).toString("utf8")));
    } catch {
      // not JSON: skip the frame
    }
    rest = rest.subarray(h + 4 + len);
  }
  return { messages, rest };
}

/** The one printed line: isAuthenticated (true only when exactly true) and a string login; null when there is no result. */
export function statusLine(r) {
  if (r === null || typeof r !== "object") return null;
  const ok = r.isAuthenticated === true;
  return JSON.stringify(ok && typeof r.login === "string" ? { isAuthenticated: true, login: r.login } : { isAuthenticated: ok });
}

function main() {
  const p = spawn("copilot", ["--headless", "--stdio", "--no-auto-update", "--log-level", "none"], { stdio: ["pipe", "pipe", "ignore"] });
  const done = (code, line) => {
    if (line) process.stdout.write(`${line}\n`);
    p.kill();
    process.exit(code);
  };
  setTimeout(() => done(1, null), TIMEOUT_MS);
  p.on("error", () => done(1, null));
  p.on("exit", () => done(1, null));
  let buf = Buffer.alloc(0);
  p.stdout.on("data", (d) => {
    const r = takeMessages(Buffer.concat([buf, d]));
    buf = r.rest;
    for (const msg of r.messages) {
      if (msg.id === 1) p.stdin.write(frame(2, "auth.getStatus", {}));
      else if (msg.id === 2) {
        const line = statusLine(msg.result ?? null);
        done(line ? 0 : 1, line);
      }
    }
  });
  p.stdin.write(frame(1, "ping", { message: "mandat" }));
}

const self = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : "";
if (import.meta.url === self) main();
