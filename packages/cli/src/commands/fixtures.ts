import { MandatError } from "@mandat/contract";
import { FIXTURES, buildFixture } from "@mandat/worker";
import type { FixtureName } from "@mandat/worker";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

/** D-050 / D-099; `--name demo-shop` (демо промпт т. 9.1). */
export function fixturesBuild(io: Io, o: { mandatHome: string; force: boolean; name?: string }): number {
  const name = o.name ?? "shop";
  if (!(name in FIXTURES)) throw new MandatError("E_USAGE", `unknown fixture: ${name} (shop, demo-shop)`);
  const r = buildFixture({ repoRoot, mandatHome: o.mandatHome, force: o.force, name: name as FixtureName });
  io.stdout(`base_commit ${r.sha}${r.state === "unchanged" ? " (unchanged)" : r.state === "recreated" ? " (recreated)" : ""}\n`);
  if (name !== "shop") io.stdout(`mirror ${r.mirror}\n`);
  return 0;
}
