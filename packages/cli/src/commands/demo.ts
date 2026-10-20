import path from "node:path";
import { MandatError } from "@mandat/contract";
import type { SqlClient } from "@mandat/ledger";
import { buildFixture, seedMinimal } from "@mandat/worker";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

/** т. 5.1: `mandat demo seed --minimal` (demo org + owner + repo shop on the demo-shop mirror). */
export async function demoSeed(io: Io, o: { home: string; minimal: boolean; json: boolean; db: SqlClient & { end?: () => Promise<void> } }): Promise<number> {
  if (!o.minimal) throw new MandatError("E_USAGE", "only --minimal exists in E1б (the full seed is E3а)");
  const fx = buildFixture({ repoRoot, mandatHome: o.home, force: false, name: "demo-shop" });
  try {
    const r = await seedMinimal(o.db, { remoteUrl: `file://${path.resolve(fx.mirror)}` });
    if (o.json) printJson(io, { ...r, base_commit: fx.sha, exit: 0 });
    else io.stdout(`demo org ${r.org}${r.created ? "" : " (already seeded)"} · owner ${r.owner} · repo mandat-demo/shop @ ${fx.sha.slice(0, 12)}\n`);
    return 0;
  } catch (e) {
    io.stderr(`demo seed: ${(e as Error).message.split("\n")[0] ?? ""}\n`);
    return 3;
  } finally {
    await o.db.end?.();
  }
}
