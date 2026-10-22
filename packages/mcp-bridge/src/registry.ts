import { z } from "zod";
import { MandatError, McpServerRef } from "@mandat/contract";

// E8e (v5 p. 4.5 (2), D-354): the official MCP registry, GET /v0.1/servers (read live 2026-10-22, research-tools.md §4.1).
// It is a discovery index, not a trust anchor: a server is added with an exact version and vetted before use.
export const REGISTRY = "https://registry.modelcontextprotocol.io";

const Pkg = z.looseObject({
  registryType: z.string().optional(),
  identifier: z.string().max(200).optional(),
  version: z.string().max(64).optional(),
  transport: z.looseObject({ type: z.string() }).optional(),
  environmentVariables: z.array(z.looseObject({ name: z.string(), isSecret: z.boolean().optional() })).max(50).optional(),
});
const Entry = z.looseObject({
  server: z.looseObject({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    version: z.string().min(1).max(64),
    packages: z.array(Pkg).max(20).optional(),
    remotes: z.array(z.looseObject({ type: z.string(), url: z.string().max(500) })).max(20).optional(),
  }),
});
const Page = z.looseObject({ servers: z.array(Entry), metadata: z.looseObject({ nextCursor: z.string().nullable().optional() }).optional() });
type EntryT = z.infer<typeof Entry>["server"];

export interface RegistryServer { name: string; description: string; versions: string[]; entries: EntryT[] }

/** One page (limit ≤ 100), filtered by text in name or description; versions newest first as the registry lists them. */
export async function listRegistry(o: { fetch: (url: string) => Promise<Response>; query: string; limit: number; cursor?: string }): Promise<RegistryServer[]> {
  const url = `${REGISTRY}/v0.1/servers?limit=${Math.min(Math.max(o.limit, 1), 100)}${o.cursor ? `&cursor=${encodeURIComponent(o.cursor)}` : ""}`;
  const r = await o.fetch(url);
  if (!r.ok) throw new MandatError("E_USAGE", `registry: HTTP ${r.status}`);
  const p = Page.safeParse(await r.json().catch(() => null));
  if (!p.success) throw new MandatError("E_USAGE", "registry: unexpected answer");
  const q = o.query.trim().toLowerCase();
  const by = new Map<string, RegistryServer>();
  for (const { server: s } of p.data.servers) {
    if (q && !s.name.toLowerCase().includes(q) && !(s.description ?? "").toLowerCase().includes(q)) continue;
    const row = by.get(s.name) ?? { name: s.name, description: (s.description ?? "").slice(0, 200), versions: [], entries: [] };
    row.versions.push(s.version);
    row.entries.push(s);
    by.set(s.name, row);
  }
  return [...by.values()];
}

/** The catalog row for an exact version: stdio → the pinned npm package; streamable-http → the URL and its host. */
export function refFromRegistry(s: RegistryServer, version: string, name: string): McpServerRef {
  if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version)) throw new MandatError("E_USAGE", "an MCP server needs an exact version (never latest)");
  const e = s.entries.find((x) => x.version === version);
  if (!e) throw new MandatError("E_USAGE", `${s.name}: no version ${version}`);
  const npm = (e.packages ?? []).find((p) => p.registryType === "npm" && p.identifier && (p.transport?.type ?? "stdio") === "stdio");
  const remote = (e.remotes ?? []).find((x) => x.type === "streamable-http" && /^https:\/\//.test(x.url));
  const base = { name, version, digest: null, tools_hash: null, enabled_tools: null };
  if (npm?.identifier) {
    const secrets = (npm.environmentVariables ?? []).filter((v) => v.isSecret && /^[A-Z_][A-Z0-9_]*$/.test(v.name)).map((v) => v.name);
    return McpServerRef.parse({ ...base, transport: "stdio", package: `${npm.identifier}@${npm.version ?? version}`, url: null, egress_hosts: [], secrets });
  }
  if (remote) return McpServerRef.parse({ ...base, transport: "http", package: null, url: remote.url, egress_hosts: [new URL(remote.url).hostname], secrets: [] });
  throw new MandatError("E_USAGE", `${s.name}@${version}: no npm stdio package and no streamable-http remote`);
}
