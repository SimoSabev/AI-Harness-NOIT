import { PassThrough } from "node:stream";
import { MandatError, Materialized, hashJcs } from "@mandat/contract";
import type { Sha256 } from "@mandat/contract";
import { runSandbox } from "@mandat/verify";
type SandboxCtx = Parameters<typeof runSandbox>[0];

export const HARNESS_IN = "/m/in/harness";

// Runs as root in a seed container (no network): writes each file under /m/in/harness with its mode, then every
// directory 0555. The agent (uid 1000) can read and run them, never change them (D-311).
const SCRIPT = `
const fs = require("node:fs"), path = require("node:path");
const base = ${JSON.stringify(HARNESS_IN)};
const files = JSON.parse(fs.readFileSync(0, "utf8"));
fs.rmSync(base, { recursive: true, force: true });
fs.mkdirSync(base, { recursive: true });
const dirs = new Set([base]);
for (const f of files) {
  const p = path.resolve(base, f.path);
  if (!p.startsWith(base + "/")) { process.stderr.write("bad path\\n"); process.exit(3); }
  let d = path.dirname(p);
  fs.mkdirSync(d, { recursive: true });
  while (d.startsWith(base)) { dirs.add(d); d = path.dirname(d); }
  fs.writeFileSync(p, f.bytes);
  fs.chmodSync(p, parseInt(f.mode, 8));
}
for (const d of dirs) fs.chmodSync(d, 0o555);
`;

/** Writes Materialized.files into /m/in/harness of the run volume (before the agent phase). Returns their hash. */
export async function seedHarness(ctx: SandboxCtx, volume: string, files: Materialized["files"]): Promise<Sha256> {
  const parsed = Materialized.shape.files.parse(files);
  const res = await runSandbox(ctx, {
    role: "seed", user: "0:0", volume, network: "none", env: { phase: "none" },
    cmd: ["node", "-e", SCRIPT], stdin: PassThrough.from([JSON.stringify(parsed)]) as unknown as NodeJS.ReadableStream, timeoutMs: 60_000,
  });
  if (res.exitCode !== 0) throw new MandatError("E_DOCKER", "harness seed failed", { exit: res.exitCode });
  return harnessFilesHash(parsed);
}

/** The hash of the control layer as seeded (SH2-CX compares it with what is there after the agent). */
export function harnessFilesHash(files: Materialized["files"]): Sha256 {
  return hashJcs([...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
}
