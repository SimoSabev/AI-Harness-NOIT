import { MandatError } from "@mandat/contract";
import { fromEntry, fromServerJson, isObj } from "./candidate.js";
import type { ImportCandidate } from "./candidate.js";

const MAX_SERVERS = 50;
const MAX_TEXT = 512 * 1024;

/** The servers object of any client's JSON: mcpServers (Claude, Cursor, Gemini), servers (VS Code), mcp (OpenCode). */
export function serversOf(o: Record<string, unknown>): Record<string, unknown> | null {
  for (const k of ["mcpServers", "servers", "mcp"]) {
    const v = o[k];
    if (isObj(v)) return v;
  }
  return null;
}
export const fromServers = (servers: Record<string, unknown>, origin: string): ImportCandidate[] =>
  Object.entries(servers).slice(0, MAX_SERVERS).map(([n, e]) => fromEntry(n, e, origin));

/** Pasted JSON: a client config, a single registry server.json, or one bare entry ({command…} / {url…}). */
export function parseMcpJson(text: string, origin: string): ImportCandidate[] {
  if (text.length > MAX_TEXT) throw new MandatError("E_USAGE", "json: too large");
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new MandatError("E_USAGE", "json: not valid JSON");
  }
  if (!isObj(o)) throw new MandatError("E_USAGE", "json: expected an object");
  const servers = serversOf(o);
  if (servers) return fromServers(servers, origin);
  if (typeof o.name === "string" && (Array.isArray(o.packages) || Array.isArray(o.remotes))) return [fromServerJson(o, origin)];
  if ("command" in o || "url" in o || "httpUrl" in o) return [fromEntry(typeof o.name === "string" ? o.name : "mcp", o, origin)];
  throw new MandatError("E_USAGE", "json: no MCP servers found");
}

// Codex ~/.codex/config.toml: only [mcp_servers.<name>] tables are read (D-485). A small line reader for that subset;
// strings, one-line string arrays and inline tables; the values of env tables are dropped as they are read.
const TABLE = /^\[\s*mcp_servers\.(?:"([^"]{1,64})"|([A-Za-z0-9_-]{1,64}))(?:\.(env|http_headers|env_http_headers))?\s*\]\s*$/;
const KV = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/;
const tomlStr = (v: string): string | null => {
  const m = /^(["'])(.*)\1\s*(#.*)?$/.exec(v.trim());
  return m ? (m[2] ?? "") : null;
};
const tomlArr = (v: string): string[] => [...v.matchAll(/(["'])((?:(?!\1).)*)\1/g)].map((m) => m[2] ?? "");
const tomlKeys = (v: string): string[] => [...v.replace(/^\{|\}$/g, "").matchAll(/(?:^|,)\s*([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1] ?? "");

export function parseCodexToml(text: string, origin: string): ImportCandidate[] {
  const servers = new Map<string, Record<string, unknown>>();
  let cur: { name: string; sub: string | null } | null = null;
  for (const raw of text.split(/\r?\n/).slice(0, 5000)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      const t = TABLE.exec(line);
      const n = t?.[1] ?? t?.[2];
      cur = n ? { name: n, sub: t?.[3] ?? null } : null;
      if (cur && !servers.has(cur.name)) servers.set(cur.name, {});
      continue;
    }
    const kv = KV.exec(line);
    if (!cur || !kv?.[1] || kv[2] === undefined) continue;
    const e = servers.get(cur.name) ?? {};
    const [k, v] = [kv[1], kv[2]];
    if (cur.sub) {
      const bucket = (e[cur.sub] as Record<string, string> | undefined) ?? {};
      e[cur.sub] = { ...bucket, [k]: "" }; // the value is never kept
    } else if (k === "env" || k === "http_headers" || k === "env_http_headers") {
      e[k] = Object.fromEntries(tomlKeys(v.trim()).map((x) => [x, ""]));
    } else if (k === "args" || k === "env_vars") {
      e[k] = tomlArr(v);
    } else if (k === "command" || k === "url" || k === "bearer_token_env_var") {
      const s = tomlStr(v);
      if (s !== null) e[k] = s;
    }
    servers.set(cur.name, e);
  }
  return [...servers.entries()].slice(0, MAX_SERVERS).map(([n, e]) => fromEntry(n, e, origin));
}
