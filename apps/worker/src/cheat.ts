import { existsSync, readFileSync, statSync } from "node:fs";
import type { Evidence } from "@mandat/contract";
import { d13Cheat, toolInputs } from "@mandat/core";

// D-544 (М2 Х7): the run's side of the cheat monitor. It watches runs judged by hidden tests (where gaming the judge
// matters; D2 watches the visible tests everywhere). The oracle task writes the hidden tests itself, so it is not
// watched; a run without a change has nothing to judge.
const MAX_TRANSCRIPT = 52_428_800;

function transcriptRows(file: string): unknown[] {
  if (!existsSync(file) || statSync(file).size > MAX_TRANSCRIPT) return [];
  const rows: unknown[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // a line that is not JSON has no tool call
    }
  }
  return rows;
}

export function cheatEvidence(o: { diff: string; transcript: string; oracle: boolean; hidden: boolean }): Evidence | null {
  if (o.oracle || !o.hidden || o.diff.trim() === "") return null;
  return d13Cheat({ diffPatch: o.diff, toolInputs: toolInputs(transcriptRows(o.transcript)) });
}
