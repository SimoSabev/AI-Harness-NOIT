import { compareReport, openDb, startSingleArm } from "@mandat/worker";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { localDbUrl } from "./local.js";

// М4 (Х10, D-565): `mandat compare start --job <id>` gives the job's approved spec and oracle to one agent in one task
// (the worker of `pnpm local` runs it like any task); `mandat compare report --job <id>` scores both arms by the
// hidden oracle, then the verdict, the cost and the time.
export async function compareCommand(io: Io, o: { op: "start" | "report"; job: string; dbPort: number; json: boolean }): Promise<number> {
  const db = openDb(io.env.MANDAT_DB_URL ?? localDbUrl(o.dbPort));
  try {
    if (o.op === "start") {
      const r = await startSingleArm(db, { job: o.job });
      if (o.json) printJson(io, r);
      else io.stdout(r.ok ? `single-agent arm started: ${r.task}\n` : `not started: ${r.reason}\n`);
      return r.ok ? 0 : 1;
    }
    const r = await compareReport(db, { job: o.job });
    if (!r) {
      io.stderr(`compare: no job ${o.job}\n`);
      return 1;
    }
    if (o.json) {
      printJson(io, r);
      return 0;
    }
    const row = (name: string, a: typeof r.process) => `${name.padEnd(8)} ${String(a.verdict ?? "-").padEnd(9)} hidden ${a.hidden_passed}/${a.hidden_total}  ${a.usd.toFixed(2)} USD  ${Math.round(a.minutes)} min${a.done ? "" : "  (not finished)"}\n`;
    io.stdout(`job ${r.job}\n${row("process", r.process)}${row("single", r.single)}winner: ${r.comparison.winner} (${r.comparison.why})\n`);
    return 0;
  } finally {
    await db.end().catch(() => undefined);
  }
}
