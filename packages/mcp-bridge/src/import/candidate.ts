import { MandatError, McpServerRef } from "@mandat/contract";
import type { Finding } from "../vet.js";

// D-480/D-482: every import source (pasted JSON, a client's config, GitHub, npm, a catalog, a URL) ends in one candidate.
// It names the secrets the server needs but never carries a value: env/header values are dropped where they are read.
export type ImportProblem = "needs_version" | "not_npm" | "not_https" | "poisoned" | "not_hosted" | "unknown_shape";
export type ImportNote = "needs_key" | "sse_legacy" | "args_dropped" | "from_package_json" | "not_marked_mcp";
export interface ImportCandidate {
  name: string;
  transport: "stdio" | "http";
  /** stdio: the npm package, with @exact-version once known */
  package: string | null;
  url: string | null;
  /** exact semver, or null (a stdio package still to be resolved; a hosted http server has none) */
  version: string | null;
  egress_hosts: string[];
  /** env var NAMES only */
  secrets: string[];
  /** where it came from: json, local:claude, github:o/r@sha7, npm, registry, smithery:<name>, url */
  origin: string;
  /** null = can be added to the catalog (then approved and vetted) */
  problem: ImportProblem | null;
  notes: ImportNote[];
  /** a catalog that publishes tool descriptions lets us scan them before approval */
  findings: Finding[];
}

export const EXACT = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** A name the profile accepts: lowercase, [a-z0-9_-], ≤ 64, starting with a letter or digit. */
export function safeName(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[-_]+|-+$/g, "").slice(0, 64);
  return s === "" ? "mcp" : s;
}
const base = (name: string, origin: string): ImportCandidate => ({ name: safeName(name), transport: "stdio", package: null, url: null, version: null, egress_hosts: [], secrets: [], origin, problem: null, notes: [], findings: [] });
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
export const envNames = (xs: Iterable<string>): string[] => uniq([...xs].filter((k) => ENV_NAME.test(k))).slice(0, 20);

/** "pkg", "pkg@1.2.3", "@s/pkg@1.2.3"; latest/ranges are never kept (version null → resolve to an exact number). */
export function splitSpec(spec: string): { name: string; version: string | null; range: string | null } | null {
  const at = spec.startsWith("@") ? spec.indexOf("@", 1) : spec.indexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const v = at > 0 ? spec.slice(at + 1) : "";
  if (!NPM_NAME.test(name) || name.length > 200) return null;
  if (EXACT.test(v)) return { name, version: v, range: null };
  return { name, version: null, range: v === "" || v === "latest" ? null : v };
}

export function npmCandidate(name: string, spec: string, secrets: string[], origin: string): ImportCandidate {
  const s = splitSpec(spec);
  if (!s) return { ...base(name, origin), problem: "not_npm" };
  return { ...base(name, origin), package: s.version ? `${s.name}@${s.version}` : s.name, version: s.version, secrets: envNames(secrets), problem: s.version ? null : "needs_version" };
}

/** A remote MCP server: https only (http only on this machine); its host is the only network it gets. */
export function remoteCandidate(url: string, name?: string, origin = "url", notes: ImportNote[] = []): ImportCandidate {
  const u = URL.canParse(url) ? new URL(url) : null;
  const ok = u !== null && url.length <= 500 && (u.protocol === "https:" || (u.protocol === "http:" && LOCAL_HOST.test(u.hostname)));
  const c = { ...base(name ?? (u?.hostname || "remote").replace(/\./g, "-"), origin), transport: "http" as const };
  if (!ok || !u) return { ...c, problem: "not_https" };
  const sse = /\/sse\/?$/.test(u.pathname) ? (["sse_legacy"] as const) : [];
  return { ...c, url: url.trim(), egress_hosts: [u.hostname], notes: uniq([...notes, ...sse]) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** keys only: the values of env and headers are never copied */
const keysOf = (v: unknown): string[] => (isObj(v) ? Object.keys(v) : []);

function stdio(name: string, cmd: string, args: string[], secrets: string[], origin: string): ImportCandidate {
  const prog = (cmd.split(/[\\/]/).pop() ?? cmd).replace(/\.(cmd|exe)$/i, "").toLowerCase();
  if (prog !== "npx") return { ...base(name, origin), secrets: envNames(secrets), problem: "not_npm" };
  const i = args.findIndex((a) => !a.startsWith("-"));
  const spec = i >= 0 ? args[i] : undefined;
  if (!spec) return { ...base(name, origin), problem: "not_npm" };
  const c = npmCandidate(name, spec, secrets, origin);
  return args.length > i + 1 ? { ...c, notes: [...c.notes, "args_dropped"] } : c;
}

/** One server entry of any client's JSON (Claude/Cursor/Gemini/VS Code/OpenCode) or of Codex TOML. */
export function fromEntry(name: string, e: unknown, origin: string): ImportCandidate {
  if (!isObj(e)) return { ...base(name, origin), problem: "unknown_shape" };
  const secrets = [...keysOf(e.env), ...keysOf(e.environment), ...strs(e.env_vars)];
  const needsKey = keysOf(e.headers).length > 0 || keysOf(e.http_headers).length > 0 || keysOf(e.env_http_headers).length > 0 || typeof e.bearer_token_env_var === "string";
  const cmdArr = strs(e.command);
  const cmd = Array.isArray(e.command) ? (cmdArr[0] ?? null) : str(e.command);
  const args = Array.isArray(e.command) ? cmdArr.slice(1) : strs(e.args);
  if (cmd) return stdio(name, cmd, args, secrets, origin);
  const url = str(e.url) ?? str(e.httpUrl) ?? str(e.serverUrl);
  if (url) {
    const notes: ImportNote[] = [...(needsKey ? (["needs_key"] as const) : []), ...(e.type === "sse" ? (["sse_legacy"] as const) : [])];
    return remoteCandidate(url, name, origin, notes);
  }
  return { ...base(name, origin), problem: "unknown_shape" };
}

/** A registry server.json (official schema): an npm stdio package, else a streamable-http/sse remote. */
export function fromServerJson(s: Record<string, unknown>, origin: string): ImportCandidate {
  const name = String(s.name ?? "mcp").split("/").pop() ?? "mcp";
  const pkgs = Array.isArray(s.packages) ? s.packages.filter(isObj) : [];
  const npm = pkgs.find((p) => p.registryType === "npm" && typeof p.identifier === "string" && (!isObj(p.transport) || (p.transport.type ?? "stdio") === "stdio"));
  if (npm) {
    const ver = str(npm.version) ?? str(s.version) ?? "";
    const secrets = (Array.isArray(npm.environmentVariables) ? npm.environmentVariables.filter(isObj) : []).filter((v) => v.isSecret === true).map((v) => String(v.name));
    return npmCandidate(name, `${String(npm.identifier)}@${ver}`, secrets, origin);
  }
  const remote = (Array.isArray(s.remotes) ? s.remotes.filter(isObj) : []).find((r) => (r.type === "streamable-http" || r.type === "sse") && typeof r.url === "string");
  if (remote) {
    const needsKey = Array.isArray(remote.headers) && remote.headers.length > 0;
    return remoteCandidate(String(remote.url), name, origin, [...(needsKey ? (["needs_key"] as const) : []), ...(remote.type === "sse" ? (["sse_legacy"] as const) : [])]);
  }
  return { ...base(name, origin), problem: "not_npm" };
}

/** The catalog row: only a candidate without a problem; a hosted http server without a version is "0.0.0" (its tools hash pins it). */
export function candidateRef(c: ImportCandidate): McpServerRef {
  if (c.problem !== null) throw new MandatError("E_USAGE", `${c.name}: ${c.problem}`);
  if (c.transport === "stdio" && (!c.version || !c.package)) throw new MandatError("E_USAGE", `${c.name}: an MCP server needs an exact version (never latest)`);
  return McpServerRef.parse({ name: c.name, transport: c.transport, package: c.package, url: c.url, version: c.version ?? "0.0.0", digest: null, tools_hash: null, enabled_tools: null, egress_hosts: c.egress_hosts, secrets: c.secrets });
}
export { isObj, keysOf, str, strs };
