import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MandatError } from "@mandat/contract";
import { annotate, dirView, propose, scanRepo } from "@mandat/onboard";
import { printJson } from "../output.js";
import type { Io } from "../output.js";

// Демо промпт т. 8.2: `mandat init` (local) writes `.mandat.yml.proposed` with a source column; it never approves and
// never touches `.mandat.yml`, AGENTS.md or CLAUDE.md.
export function initCommand(io: Io, o: { repo: string; json: boolean }): number {
  const dir = path.resolve(o.repo);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new MandatError("E_USAGE", `--repo is not a directory: ${o.repo}`);
  const scan = scanRepo(dirView(dir));
  const p = propose(scan);
  const out = path.join(dir, ".mandat.yml.proposed");
  writeFileSync(out, `${annotate(p.yaml, p.field_sources)}\n`);
  if (o.json) {
    printJson(io, { file: out, sha256: p.sha256, field_sources: p.field_sources, needs_human: p.needs_human, blocked: p.blocked, warnings: p.warnings, risk_cap: p.risk_cap, exit: 0 });
    return 0;
  }
  io.stdout(`${path.relative(process.cwd(), out) || out} · ${p.sha256.slice(0, 15)}… · risk_cap ${p.risk_cap}\n`);
  io.stdout(`${"field".padEnd(26)} source\n`);
  for (const [k, v] of Object.entries(p.field_sources).sort()) io.stdout(`${k.padEnd(26)} ${v}\n`);
  for (const n of p.needs_human) io.stdout(`needs human: ${n}\n`);
  for (const b of p.blocked) io.stdout(`BLOCKED (invisible characters): ${b}\n`);
  for (const w of p.warnings) io.stdout(`warning: ${w}\n`);
  io.stdout("Not approved. Review it, then approve in the UI (owner + TOTP).\n");
  return 0;
}
