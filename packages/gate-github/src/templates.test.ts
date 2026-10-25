import { describe, expect, it } from "vitest";
import { Verdict } from "@mandat/contract";
import { commitMessage, diffStats, prBody, prTitle } from "./templates.js";

// E8g (v5 p. 4.7 (1)–(2), AC-9.1, D-356): one squash commit per attempt with a deterministic message and trailers; the PR
// body is a template (task, change per file, before → after, verdict, level, the card) — no raw external text, no LLM.
const v = Verdict.parse({
  run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: "t_x", attempt: 1, agent: "claude", result: "VERIFIED", reasons: [],
  evidence: [
    { detector: "D1.base_tests", phase: 1, status: "pass", summary: "20/20", data: {}, source: "sandbox:verify", agent_visible: true },
    { detector: "D2.inventory", phase: 1, status: "pass", summary: "20 → 21", data: {}, source: "sandbox:verify", agent_visible: true },
    { detector: "D11.mutation", phase: 2, status: "n/a", summary: "not run", data: {}, source: "sandbox:verify", agent_visible: true },
  ],
  contract_hash: `sha256:${"a".repeat(64)}`, base_sha: "a".repeat(40), tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
  usage: { usd: 0.12, input_tokens: 1, output_tokens: 1, requests: 1 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-10-22T00:00:00.000Z",
});
const DIFF = Buffer.from("diff --git a/src/cart.ts b/src/cart.ts\n--- a/src/cart.ts\n+++ b/src/cart.ts\n@@ -7,1 +7,1 @@\n-const A = 1;\n+const A = 2;\ndiff --git a/tests/x`|y.spec.ts b/tests/x`|y.spec.ts\nnew file mode 100644\n--- /dev/null\n+++ b/tests/x`|y.spec.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n");

describe("commit message", () => {
  it("<type>: <title> ≤ 72; the passing checks; the trailers; no Co-Authored-By unless the project asks", () => {
    const m = commitMessage({ type: "bugfix", text: "Fix the VAT rounding in the cart total\nmore details", taskId: "t_x", verdict: v, ledgerSeq: 42 });
    const [title, , ...rest] = m.split("\n");
    expect(title).toBe("fix: Fix the VAT rounding in the cart total");
    expect(rest.join("\n")).toContain("Checked: D1.base_tests, D2.inventory");
    expect(m).toContain("Mandat-Verdict: VERIFIED seq 42");
    expect(m).toContain("Mandat-Task: t_x");
    expect(m).not.toContain("Co-Authored-By");
    expect(commitMessage({ type: "docs", text: "x".repeat(200), taskId: "t_x", verdict: v, ledgerSeq: null }).split("\n")[0]?.length).toBeLessThanOrEqual(72);
    expect(commitMessage({ type: "feature", text: "Add", taskId: "t_x", verdict: v, ledgerSeq: 1, coAuthors: ["Mandat <bot@mandat.invalid>"] })).toContain("Co-Authored-By: Mandat <bot@mandat.invalid>");
  });
  it("control and bidi characters never reach the title", () => {
    expect(commitMessage({ type: "bugfix", text: "Fix‮ evil\u0007", taskId: "t_x", verdict: v, ledgerSeq: 1 }).split("\n")[0]).toBe("fix: Fix evil");
  });
});

describe("PR body", () => {
  it("diffStats per file", () => {
    expect(diffStats(DIFF)).toEqual([{ path: "src/cart.ts", added: 1, removed: 1 }, { path: "tests/x`|y.spec.ts", added: 2, removed: 0 }]);
  });
  it("the template: task, the change per file (code spans), tests before → after, verdict, level, the card; no raw external text", () => {
    const b = prBody({ text: "Fix <script>alert(1)</script> rounding", taskId: "t_x", diff: DIFF, verdict: v, level: 2, ledgerSeq: 42, cardUrl: "http://localhost:3000/tasks/t_x" });
    expect(b).toContain("`src/cart.ts`");
    expect(b).toContain("`tests/x'\\|y.spec.ts`");
    expect(b).toContain("20 → 21");
    expect(b).toContain("VERIFIED");
    expect(b).toContain("level 2");
    expect(b).toContain("http://localhost:3000/tasks/t_x");
    expect(b).not.toContain("<script>");
    expect(b).toContain("&lt;script&gt;");
    expect(prTitle({ type: "bugfix", text: "Fix the VAT rounding" })).toBe("fix: Fix the VAT rounding");
  });
});
