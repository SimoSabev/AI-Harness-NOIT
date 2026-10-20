import { H_UP_DEFAULT, simulateLadder } from "@mandat/core";
import { MandatError } from "@mandat/contract";
import type { Io } from "../output.js";
import { printJson } from "../output.js";

/** Демо промпт т. 5.5: `mandat ladder sim --p 0.95 --h 5 [--runs 10000] [--seed 1]`; the spec says ≈ 87. */
export function ladderSim(io: Io, o: { p: string; h?: string; runs?: string; seed?: string; json: boolean }): number {
  const num = (s: string | undefined, d: number, name: string) => {
    const n = s === undefined ? d : Number(s);
    if (!Number.isFinite(n)) throw new MandatError("E_USAGE", `--${name} must be a number`);
    return n;
  };
  const p = num(o.p, 0.95, "p");
  if (p <= 0 || p > 1) throw new MandatError("E_USAGE", "--p must be in (0, 1]");
  const h = num(o.h, H_UP_DEFAULT, "h");
  const runs = Math.trunc(num(o.runs, 10000, "runs"));
  const seed = Math.trunc(num(o.seed, 1, "seed"));
  if (runs < 1 || runs > 1_000_000 || h <= 0) throw new MandatError("E_USAGE", "--runs in 1..1000000, --h > 0");
  const r = simulateLadder({ p, h, runs, seed });
  const spec = 87;
  const diff = (r.mean - spec) / spec;
  if (o.json) printJson(io, { p, h, runs, seed, mean: r.mean, censored: r.censored, spec, diff });
  else io.stdout(`ladder sim: p=${p} h=${h} runs=${runs} seed=${seed} → mean ${r.mean.toFixed(1)} tasks to level 1 (spec ≈ ${spec}; ${(diff * 100).toFixed(1)}%)\n`);
  return 0;
}
