import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  MandatError,
  UnsealedContract,
  contractForAgent,
  exitCodeOf,
  parseContract,
  renderAgentContract,
  sealContract,
} from "@mandat/contract";
import type { Io } from "../output.js";

function readJson(io: Io, file: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path.resolve(io.cwd, file), "utf8")) };
  } catch (e) {
    io.stderr(`invalid contract: ${file}: ${e instanceof Error ? e.message : String(e)}\n`);
    return { ok: false };
  }
}

/** D-099 / D-122: parse as UnsealedContract, fill both hashes, write JSON (2 spaces, LF). Invalid → 5. */
export function contractSeal(io: Io, file: string): number {
  const j = readJson(io, file);
  if (!j.ok) return 5;
  const u = UnsealedContract.safeParse(j.value);
  if (!u.success) {
    io.stderr(`invalid contract: ${u.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}\n`);
    return 5;
  }
  const sealed = sealContract(u.data);
  writeFileSync(path.resolve(io.cwd, file), JSON.stringify(sealed, null, 2) + "\n");
  io.stdout(`sealed ${file} contract_hash ${sealed.contract_hash}\n`);
  return 0;
}

export function contractShowAgent(io: Io, file: string): number {
  const j = readJson(io, file);
  if (!j.ok) return 5;
  try {
    io.stdout(renderAgentContract(contractForAgent(parseContract(j.value))));
    return 0;
  } catch (e) {
    if (!(e instanceof MandatError)) throw e;
    io.stderr(`${e.code}: ${e.message}\n`);
    return exitCodeOf(e.code);
  }
}
