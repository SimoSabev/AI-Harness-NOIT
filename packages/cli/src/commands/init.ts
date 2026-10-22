import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MandatError } from "@mandat/contract";
import { annotate, dirView, propose, scanRepo } from "@mandat/onboard";
import type { Baseline } from "@mandat/onboard";
import type { MandatPolicy } from "@mandat/contract";
import { printJson } from "../output.js";
import type { Io } from "../output.js";

// Демо промпт т. 8.2: `mandat init` (local) writes `.mandat.yml.proposed` with a source column; it never approves and
// never touches `.mandat.yml`, AGENTS.md or CLAUDE.md.
export async function initCommand(io: Io, o: { repo: string; json: boolean; baseline?: boolean; runBaseline?: (dir: string, policy: MandatPolicy) => Promise<Baseline> }): Promise<number> {
  const dir = path.resolve(o.repo);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new MandatError("E_USAGE", `--repo is not a directory: ${o.repo}`);
  const scan = scanRepo(dirView(dir));
  // E7г (D-314): --baseline runs the tests of this tree twice in the sandbox (Docker) and proposes with the result
  const baseline = o.baseline && o.runBaseline ? await o.runBaseline(dir, propose(scan).policy) : null;
  const p = propose(scan, { baseline });
  const out = path.join(dir, ".mandat.yml.proposed");
  writeFileSync(out, `${annotate(p.yaml, p.field_sources)}\n`);
  if (o.json) {
    printJson(io, { file: out, sha256: p.sha256, field_sources: p.field_sources, needs_human: p.needs_human, blocked: p.blocked, warnings: p.warnings, risk_cap: p.risk_cap, baseline, suggested_tasks: p.suggested_tasks, exit: 0 });
    return 0;
  }
  io.stdout(`${path.relative(process.cwd(), out) || out} · ${p.sha256.slice(0, 15)}… · risk_cap ${p.risk_cap}\n`);
  if (baseline) io.stdout(`baseline: ${baseline.status} · ${baseline.test_ids_count} tests · ${baseline.skipped} skipped · ${baseline.duration_s} s · flaky ${baseline.flaky?.length ?? 0}${baseline.flaky?.length ? ` (${baseline.flaky.join(", ")})` : ""}\n`);
  for (const t of p.suggested_tasks) io.stdout(`suggested first task (${t.type}): ${t.title}\n`);
  io.stdout(`${"field".padEnd(26)} source\n`);
  for (const [k, v] of Object.entries(p.field_sources).sort()) io.stdout(`${k.padEnd(26)} ${v}\n`);
  for (const n of p.needs_human) io.stdout(`needs human: ${n}\n`);
  for (const b of p.blocked) io.stdout(`BLOCKED (invisible characters): ${b}\n`);
  for (const w of p.warnings) io.stdout(`warning: ${w}\n`);
  io.stdout("Not approved. Review it, then approve in the UI (owner + TOTP).\n");
  return 0;
}
