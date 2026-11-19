import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cheatEvidence } from "./cheat.js";

// D-544: the run's side of the cheat monitor — the change and the tool inputs of transcript.jsonl; never on an oracle task
// (it writes the hidden tests itself) and never without a change.
describe("the cheat monitor in a run (D-544)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mandat-cheat-"));
  const transcript = path.join(dir, "transcript.jsonl");
  writeFileSync(transcript, `${JSON.stringify({ message: { content: [{ type: "tool_use", input: { command: "grep -r __hidden__ ." } }] } })}\nnot json\n`);
  const diff = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n x\n+const y = 1;\n";
  it("reads the transcript's tool inputs", () => {
    expect(cheatEvidence({ diff, transcript, oracle: false, hidden: true })).toMatchObject({ detector: "D13.cheat", status: "unknown", data: { findings: [{ cls: "hidden_probe", id: "tool:1" }] } });
  });
  it("no transcript file: the change alone", () => {
    expect(cheatEvidence({ diff, transcript: path.join(dir, "none.jsonl"), oracle: false, hidden: true })?.status).toBe("pass");
  });
  it("an oracle task, no change, or no hidden tests: not run", () => {
    expect(cheatEvidence({ diff, transcript, oracle: true, hidden: true })).toBeNull();
    expect(cheatEvidence({ diff: "", transcript, oracle: false, hidden: true })).toBeNull();
    expect(cheatEvidence({ diff, transcript, oracle: false, hidden: false })).toBeNull();
  });
});
