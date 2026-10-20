import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { verifyLedger } from "@mandat/ledger";
import { displayPath, printJson, shortHash } from "../output.js";
import type { Io } from "../output.js";

/** D-026 / D-128: 0 ok, 1 mismatch, 3 missing ledger. */
export function verifyLog(io: Io, o: { ledger: string; org: "o_local"; json: boolean }): number {
  const file = path.resolve(io.cwd, o.ledger);
  if (!existsSync(file)) {
    io.stderr(`ledger not found: ${o.ledger}\n`);
    return 3;
  }
  const lines = readFileSync(file, "utf8").split("\n");
  const r = verifyLedger(lines, { org: o.org });
  if (o.json) {
    printJson(io, r);
    return r.ok ? 0 : 1;
  }
  const count = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  io.stdout(`ledger ${displayPath(io, file)} · org ${o.org} · ${count} lines\n`);
  if (r.ok) {
    io.stdout(r.count === 0 ? "OK: empty ledger\n" : `OK: chain intact (seq 1..${r.count}, last ${shortHash(r.lastHash)})\n`);
    return 0;
  }
  const seq = r.firstBadSeq ?? "?";
  const detail =
    r.expected !== undefined && r.actual !== undefined
      ? `expected ${shortHash(r.expected)}, recorded ${shortHash(r.actual)}`
      : r.message;
  io.stdout(`TAMPERED: seq ${seq} (line ${r.line}) ${r.code} — ${detail}\n`);
  const verified = r.countOk === 0 ? "no lines verified" : `lines 1..${r.countOk} verified`;
  io.stdout(`${verified}; nothing after seq ${seq} is trusted\n`);
  return 1;
}
