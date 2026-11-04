import { MandatError } from "@mandat/contract";
import { scanToolDefs } from "../vet.js";
import { EXACT, fromServerJson, isObj, npmCandidate, remoteCandidate, splitSpec } from "./candidate.js";
import type { ImportCandidate } from "./candidate.js";
import { parseSkill } from "./skill.js";
import type { SkillCandidate } from "./skill.js";

// D-481/D-483: the sources read over the network (from the web server, never from the sandbox). `fetch` is injected;
// every answer is parsed defensively and bounded. None of them approves anything.
export type Fetch = (url: string) => Promise<Response>;
const MAX_SKILLS = 30;

async function getJson(fetch: Fetch, url: string, what: string): Promise<Record<string, unknown>> {
  const r = await fetch(url);
  if (!r.ok) throw new MandatError("E_USAGE", `${what}: HTTP ${r.status}`);
  const j: unknown = await r.json().catch(() => null);
  if (!isObj(j)) throw new MandatError("E_USAGE", `${what}: unexpected answer`);
  return j;
}

// ---- GitHub --------------------------------------------------------------------------------------------------------
export interface GithubRef { owner: string; repo: string; ref: string | null; path: string }
const SEG = /^[A-Za-z0-9_.-]{1,100}$/;

/** github.com/o/r, …/tree/<ref>/<path>, …/blob/<ref>/<path>/SKILL.md, or o/r. A blob points at its folder. */
export function parseGithubUrl(input: string): GithubRef | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const short = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(s);
  if (short?.[1] && short[2]) return { owner: short[1], repo: short[2], ref: null, path: "" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || (u.hostname !== "github.com" && u.hostname !== "www.github.com")) return null;
  const [owner, repo, kind, ref, ...rest] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo || !SEG.test(owner) || !SEG.test(repo)) return null;
  if (!kind) return { owner, repo, ref: null, path: "" };
  if ((kind !== "tree" && kind !== "blob") || !ref || !/^[A-Za-z0-9_./-]{1,200}$/.test(ref)) return null;
  const parts = kind === "blob" ? rest.slice(0, -1) : rest;
  if (parts.some((p) => p === ".." || p === ".")) return null;
  return { owner, repo, ref, path: parts.join("/") };
}

const isMcpPackage = (p: Record<string, unknown>): boolean => {
  const deps = { ...(isObj(p.dependencies) ? p.dependencies : {}), ...(isObj(p.devDependencies) ? p.devDependencies : {}) };
  return typeof p.mcpName === "string" || Object.keys(deps).some((d) => d.startsWith("@modelcontextprotocol/")) || (Array.isArray(p.keywords) && p.keywords.includes("mcp"));
};

export interface GithubImport { commit: string; mcp: ImportCandidate[]; skills: SkillCandidate[] }
/** Pins the commit (like Paperclip), then reads server.json → package.json at the path, and every SKILL.md below it. */
export async function importGithub(o: { fetch: Fetch; url: string }): Promise<GithubImport> {
  const g = parseGithubUrl(o.url);
  if (!g) throw new MandatError("E_USAGE", "github: not a GitHub repository URL");
  const api = `https://api.github.com/repos/${g.owner}/${g.repo}`;
  const sha = String((await getJson(o.fetch, `${api}/commits/${g.ref ?? "HEAD"}`, "github")).sha ?? "");
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new MandatError("E_USAGE", "github: no commit");
  const tree = (await getJson(o.fetch, `${api}/git/trees/${sha}?recursive=1`, "github")).tree;
  const paths = (Array.isArray(tree) ? tree.filter(isObj) : []).filter((t) => t.type === "blob" && typeof t.path === "string").map((t) => String(t.path));
  const at = (f: string) => (g.path ? `${g.path}/${f}` : f);
  const under = (p: string) => g.path === "" || p.startsWith(`${g.path}/`);
  const raw = async (p: string) => {
    const r = await o.fetch(`https://raw.githubusercontent.com/${g.owner}/${g.repo}/${sha}/${p}`);
    if (!r.ok) throw new MandatError("E_USAGE", `github: HTTP ${r.status} for ${p}`);
    return (await r.text()).slice(0, 512 * 1024);
  };
  const origin = `github:${g.owner}/${g.repo}@${sha.slice(0, 7)}`;
  const mcp: ImportCandidate[] = [];
  const json = async (p: string): Promise<Record<string, unknown> | null> => {
    if (!paths.includes(p)) return null;
    const j: unknown = JSON.parse(await raw(p).catch(() => "null"));
    return isObj(j) ? j : null;
  };
  const sj = await json(at("server.json")).catch(() => null);
  if (sj) mcp.push(fromServerJson(sj, origin));
  else {
    const pj = await json(at("package.json")).catch(() => null);
    if (pj && typeof pj.name === "string" && typeof pj.version === "string" && isMcpPackage(pj)) {
      const c = npmCandidate(pj.name.split("/").pop() ?? pj.name, `${pj.name}@${pj.version}`, [], origin);
      mcp.push({ ...c, notes: [...c.notes, "from_package_json"] });
    }
  }
  const skillPaths = paths.filter((p) => under(p) && (p === "SKILL.md" || p.endsWith("/SKILL.md"))).slice(0, MAX_SKILLS);
  const skills = await Promise.all(skillPaths.map(async (p) => {
    const dir = p.split("/").slice(0, -1);
    return parseSkill(await raw(p), `${origin}:${dir.join("/")}`, dir.pop() ?? g.repo);
  }));
  return { commit: sha, mcp, skills: skills.sort((a, b) => (a.name < b.name ? -1 : 1)) };
}

// ---- npm -----------------------------------------------------------------------------------------------------------
/** pkg / pkg@1.2.3 / npmjs.com/package/pkg → an exact version, resolved now ("latest" → its number, shown to the person). */
export async function resolveNpm(o: { fetch: Fetch; spec: string; name?: string; secrets?: string[]; origin?: string }): Promise<ImportCandidate> {
  const spec = o.spec.trim().replace(/^https:\/\/(www\.)?npmjs\.com\/package\//, "").replace(/\/v\/([^/]+)$/, "@$1");
  const s = splitSpec(spec);
  if (!s) throw new MandatError("E_USAGE", "npm: not a package name");
  if (s.range) throw new MandatError("E_USAGE", "npm: an exact version is needed (not a range)");
  const meta = await getJson(o.fetch, `https://registry.npmjs.org/${s.name.replace("/", "%2F")}`, "npm");
  const versions = isObj(meta.versions) ? meta.versions : {};
  const latest = isObj(meta["dist-tags"]) ? meta["dist-tags"].latest : undefined;
  const v = s.version ?? (typeof latest === "string" ? latest : "");
  if (!EXACT.test(v) || !isObj(versions[v])) throw new MandatError("E_USAGE", `npm: ${s.name} has no version ${v || "?"}`);
  const c = npmCandidate(o.name ?? s.name.split("/").pop() ?? s.name, `${s.name}@${v}`, o.secrets ?? [], o.origin ?? "npm");
  return isMcpPackage(versions[v]) ? c : { ...c, notes: [...c.notes, "not_marked_mcp"] };
}

// ---- Smithery (catalog) --------------------------------------------------------------------------------------------
const QN = /^@?[A-Za-z0-9_.-]{1,100}(\/[A-Za-z0-9_.-]{1,100})?$/;
/** smithery.ai/server/<name>, smithery:<name> or the bare qualified name; read from the public per-server endpoint. */
export async function importSmithery(o: { fetch: Fetch; input: string }): Promise<ImportCandidate> {
  const qn = o.input.trim().replace(/^https:\/\/(www\.)?smithery\.ai\/server\//, "").replace(/^smithery:/, "").replace(/\/+$/, "");
  if (!QN.test(qn)) throw new MandatError("E_USAGE", "smithery: not a server name");
  const s = await getJson(o.fetch, `https://registry.smithery.ai/servers/${qn}`, "smithery");
  const conns = Array.isArray(s.connections) ? s.connections.filter(isObj) : [];
  const http = conns.find((c) => c.type === "http" && typeof c.deploymentUrl === "string");
  const url = typeof http?.deploymentUrl === "string" ? http.deploymentUrl : typeof s.deploymentUrl === "string" ? s.deploymentUrl : null;
  const name = qn.split("/").pop() ?? qn;
  const origin = `smithery:${qn}`;
  if (s.remote !== true || !url) return { ...remoteCandidate("invalid:", name, origin), problem: "not_hosted" };
  const tools = (Array.isArray(s.tools) ? s.tools.filter(isObj) : []).slice(0, 500).map((t) => ({ name: String(t.name ?? ""), description: typeof t.description === "string" ? t.description : undefined, inputSchema: t.inputSchema }));
  const findings = scanToolDefs(tools);
  const c = remoteCandidate(url, name, origin);
  return findings.length > 0 ? { ...c, findings, problem: "poisoned" } : c;
}
