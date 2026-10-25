import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The GitHub Action (action.yml at the root): every input reaches the verify step as INPUT_* (what action.ts reads), every
// output comes from that step, third-party actions are pinned by commit SHA.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { parse } = createRequire(path.join(root, "packages/contract/package.json"))("yaml") as { parse: (s: string) => unknown };

describe("action.yml", () => {
  it("inputs → INPUT_*, outputs ← steps.verify, actions pinned by SHA", () => {
    const a = parse(readFileSync(path.join(root, "action.yml"), "utf8")) as { inputs: Record<string, unknown>; outputs: Record<string, { value: string }>; runs: { using: string; steps: { uses?: string; id?: string; env?: Record<string, string>; run?: string }[] } };
    expect(a.runs.using).toBe("composite");
    const step = a.runs.steps.find((s) => s.id === "verify");
    expect(step?.run).toBe("node packages/verify/dist/action-main.js");
    for (const k of Object.keys(a.inputs)) expect(step?.env?.[`INPUT_${k.toUpperCase().replace(/-/g, "_")}`]).toBe(`\${{ inputs.${k} }}`);
    for (const [k, o] of Object.entries(a.outputs)) expect(o.value).toBe(`\${{ steps.verify.outputs.${k} }}`);
    for (const s of a.runs.steps) if (s.uses) expect(s.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });
});
