import type { D8Dependency } from "@mandat/core";

// v5 E9б (D8): license and publish time of new dependencies, read by the harness on the host from the npm registry
// (https://registry.npmjs.org/<name>, the packument: `versions[v].license`, `time[v]`, `dist-tags.latest`). An exact
// spec → that version; a range → `latest` (the newest a fresh install may resolve to) [НП: the lockfile's resolved
// version would be exact; D-363]. Any failure → facts null (D8 asks a human), never an exception.
type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const EXACT = /^\d+\.\d+\.\d+([-+][\w.+-]*)?$/;

export async function registryFacts(deps: { name: string; spec: string }[], o: { fetch?: FetchLike; registry?: string } = {}): Promise<D8Dependency[]> {
  const f: FetchLike = o.fetch ?? ((u, init) => fetch(u, init));
  const base = (o.registry ?? "https://registry.npmjs.org").replace(/\/+$/, "");
  const out: D8Dependency[] = [];
  for (const d of deps.slice(0, 50)) {
    const unknown = { name: d.name, version: d.spec, license: null, published_at: null };
    try {
      const r = await f(`${base}/${d.name.replace("/", "%2f")}`, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) {
        out.push(unknown);
        continue;
      }
      const p = (await r.json()) as { "dist-tags"?: Record<string, string>; versions?: Record<string, { license?: unknown }>; time?: Record<string, string> };
      const version = EXACT.test(d.spec) ? d.spec : p["dist-tags"]?.latest;
      const meta = version ? p.versions?.[version] : undefined;
      if (!version || !meta) {
        out.push(unknown);
        continue;
      }
      const lic = meta.license;
      const license = typeof lic === "string" ? lic : lic !== null && typeof lic === "object" && typeof (lic as { type?: unknown }).type === "string" ? (lic as { type: string }).type : null;
      out.push({ name: d.name, version, license, published_at: p.time?.[version] ?? null });
    } catch {
      out.push(unknown);
    }
  }
  return out;
}
