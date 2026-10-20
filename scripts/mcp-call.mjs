#!/usr/bin/env node
// Демо промпт т. 7 „Готово, когато“: a hand-written JSON-RPC client for the `mandat` MCP server over stdio (2025-11-25 era).
// node scripts/mcp-call.mjs --server "node packages/mcp/dist/main.js --same-uid --allow <abs> --remote <url>" --tool mandat_verify
// node scripts/mcp-call.mjs --server "…" --tool mandat_status --job <id> [--wait]
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Starts the server and returns a request(method, params) → result function (JSON-RPC 2.0, one line per message). */
export function rpcClient(cmd, args, env = process.env) {
  const child = spawn(cmd, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  let nextId = 1;
  const pending = new Map();
  const lines = [];
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
  child.stdout.on("data", (d) => {
    buf += d.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      lines.push(line);
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p(msg);
      }
    }
  });
  const exited = new Promise((resolve) => child.on("close", (code) => resolve(code)));
  return {
    request(method, params, meta) {
      const id = nextId++;
      const body = { jsonrpc: "2.0", id, method, params: { ...(params ?? {}), ...(meta ? { _meta: meta } : {}) } };
      child.stdin.write(JSON.stringify(body) + "\n");
      return new Promise((resolve) => pending.set(id, resolve));
    },
    notify(method, params) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }) + "\n");
    },
    lines,
    stderr: () => stderr,
    close() {
      child.stdin.end();
      return exited;
    },
    exited,
  };
}

export async function legacyHandshake(c) {
  const r = await c.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "mcp-call", version: "0.1.0" } });
  c.notify("notifications/initialized");
  return r;
}

export async function callTool(c, name, args) {
  const r = await c.request("tools/call", { name, arguments: args });
  if (r.error) return { error: r.error.message ?? String(r.error.code) };
  const text = r.result?.content?.[0]?.text ?? "{}";
  try {
    return { isError: Boolean(r.result?.isError), value: JSON.parse(text) };
  } catch {
    return { isError: Boolean(r.result?.isError), value: text };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const server = get("--server");
  const tool = get("--tool");
  if (!server || !tool) {
    console.error("usage: mcp-call.mjs --server \"<cmd> <args…>\" --tool <name> [--job <id>] [--repo <path>] [--type <t>] [--wait] [--lang bg|en]");
    process.exit(2);
  }
  const [cmd, ...args] = server.split(" ").filter(Boolean);
  const c = rpcClient(cmd, args);
  await legacyHandshake(c);
  const job = get("--job");
  const params = tool === "mandat_verify" ? { ...(get("--repo") ? { repo_path: get("--repo") } : {}), ...(get("--type") ? { task_type: get("--type") } : {}) } : { job_id: job, ...(get("--lang") ? { lang: get("--lang") } : {}) };
  let r = await callTool(c, tool, params);
  if (tool === "mandat_status" && argv.includes("--wait")) {
    const t0 = Date.now();
    while (r.value?.status === "running" && Date.now() - t0 < 15 * 60_000) {
      await new Promise((res) => setTimeout(res, 3000));
      r = await callTool(c, tool, params);
    }
  }
  const v = r.value ?? r;
  if (tool === "mandat_status" && v.status === "done") console.log(`${v.result} reasons: ${(v.reasons ?? []).join(", ")} · level ${v.effective_level} · ledger seq ${v.ledger_seq ?? "-"}`);
  else console.log(JSON.stringify(v));
  await c.close();
  process.exit(r.error || r.isError ? 1 : 0);
}
