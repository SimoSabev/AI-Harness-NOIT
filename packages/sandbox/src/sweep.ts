import { dockerText } from "./docker.js";
import type { DockerRunner } from "./docker.js";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Milliseconds encoded in a run id "r_<ULID>" (first 10 chars), or null. */
export function runIdTime(runId: string): number | null {
  const m = /^r_([0-9A-HJKMNP-TV-Z]{10})[0-9A-HJKMNP-TV-Z]{16}$/.exec(runId);
  if (!m) return null;
  let t = 0;
  for (const ch of m[1] ?? "") t = t * 32 + CROCKFORD.indexOf(ch);
  return t;
}

/** 7.3(6): removes containers, networks and volumes labelled mandat.run whose run is older than olderThanMs. */
export async function sweepOrphans(
  r: DockerRunner,
  o: { olderThanMs: number; now: Date },
): Promise<{ containers: number; networks: number; volumes: number }> {
  const old = (label: string): boolean => {
    const t = runIdTime(label.trim());
    return t !== null && o.now.getTime() - t > o.olderThanMs;
  };
  const list = async (args: string[]): Promise<string[]> => {
    const res = await dockerText(r, args);
    if (res.exitCode !== 0) return [];
    return res.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => old(l.split(" ")[1] ?? ""))
      .map((l) => l.split(" ")[0] ?? "");
  };
  const fmt = (what: string) => `{{.${what}}} {{.Label "mandat.run"}}`;
  const containers = await list(["ps", "-a", "--filter", "label=mandat.run", "--format", fmt("ID")]);
  for (const c of containers) await dockerText(r, ["rm", "-f", c]);
  const networks = await list(["network", "ls", "--filter", "label=mandat.run", "--format", fmt("Name")]);
  for (const n of networks) await dockerText(r, ["network", "rm", n]);
  const volumes = await list(["volume", "ls", "--filter", "label=mandat.run", "--format", fmt("Name")]);
  for (const v of volumes) await dockerText(r, ["volume", "rm", "-f", v]);
  return { containers: containers.length, networks: networks.length, volumes: volumes.length };
}
