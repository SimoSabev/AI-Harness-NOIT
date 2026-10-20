import { buildShopFixture } from "@mandat/worker";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

/** D-050 / D-099. */
export function fixturesBuild(io: Io, o: { mandatHome: string; force: boolean }): number {
  const r = buildShopFixture({ repoRoot, mandatHome: o.mandatHome, force: o.force });
  io.stdout(`base_commit ${r.sha}${r.state === "unchanged" ? " (unchanged)" : r.state === "recreated" ? " (recreated)" : ""}\n`);
  return 0;
}
