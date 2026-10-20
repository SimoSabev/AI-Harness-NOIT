import path from "node:path";
import { fmtDuration, runBench, runFailGate, runRedteam } from "@mandat/bench";
import type { DockerRunner } from "@mandat/sandbox";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

const contractPath = () => path.join(repoRoot, "contracts", "fix-discount.json");

/** 6.13 / D-128 / D-134. */
export async function benchCommand(io: Io, o: { mandatHome: string; only?: string[]; json: boolean; docker?: DockerRunner }): Promise<number> {
  if (!o.json) io.stdout("ID  fake                  expected  actual    reasons  time\n");
  const r = await runBench({
    home: o.mandatHome, contractPath: contractPath(), env: io.env, ...(o.only ? { only: o.only } : {}), ...(o.docker ? { docker: o.docker } : {}),
    onRow: (row) => {
      if (!o.json) io.stdout(`${row.id}  ${row.fake.padEnd(20)}  ${row.expected.padEnd(8)}  ${row.actual.padEnd(8)}  ${row.reasons_ok ? "ok     " : "MISSING"}  ${fmtDuration(row.ms)}${row.mismatch ? "  MISMATCH" : ""}${row.missing.length ? ` (missing: ${row.missing.join(", ")})` : ""}\n`);
    },
  });
  if (r.infraError) {
    io.stderr(`bench: ${r.infraError}\n`);
    if (o.json) printJson(io, { error: r.infraError, exit: 3 });
    return 3;
  }
  const total = r.rows.length;
  if (o.json) {
    printJson(io, { rows: r.rows.map(({ id, fake, expected, actual, reasons_ok, ms }) => ({ id, fake, expected, actual, reasons_ok, ms })), pass: r.pass, false_verified: r.false_verified, false_failed: r.false_failed });
  } else {
    io.stdout(`RESULT ${r.pass}/${total} · false VERIFIED ${r.false_verified} · false FAILED ${r.false_failed} · ${fmtDuration(r.ms)}\n`);
  }
  return r.pass === total && total > 0 ? 0 : 1;
}

/** T3-3 / D-223: exit 1 = the broken verifier was caught (expected); 0 = bench is broken; 3 = environment. */
export async function failGateCommand(io: Io, o: { mandatHome: string; json: boolean; docker?: DockerRunner }): Promise<number> {
  const r = await runFailGate({ home: o.mandatHome, contractPath: contractPath(), env: io.env, ...(o.docker ? { docker: o.docker } : {}) });
  if (r.error) {
    io.stderr(`bench --fail-gate: ${r.error}\n`);
    if (o.json) printJson(io, { error: r.error, exit: 3 });
    return 3;
  }
  if (o.json) printJson(io, { result: r.result, reasons: r.reasons, detected: r.detected, exit: r.detected ? 1 : 0 });
  else if (r.detected) io.stdout(`fail-gate: verifier fault detected (D1:report_invalid:missing) · verdict ${r.result}\n`);
  else io.stdout(`fail-gate: NOT detected (verdict ${r.result}) — the bench is broken\n`);
  return r.detected ? 1 : 0;
}

/** 6.13 / D-090. */
export async function redteamCommand(io: Io, o: { mandatHome: string; only?: string[]; json: boolean; docker?: DockerRunner }): Promise<number> {
  const r = await runRedteam(
    { home: o.mandatHome, contractPath: contractPath(), env: io.env, ...(o.docker ? { docker: o.docker } : {}) },
    o.only,
    (row) => {
      if (!o.json) io.stdout(`${row.id} ${row.sub} ${row.ok ? "✓" : "✗"} ${row.detail}\n`);
    },
  );
  if (o.json) printJson(io, { rows: r.rows, pass: r.pass, total: r.total });
  else io.stdout(`RESULT ${r.pass}/${r.total}\n`);
  if (r.infraError) return 3; // D-128: environment (images, Docker), not a mismatch
  return r.pass === r.total && r.total > 0 ? 0 : 1;
}
