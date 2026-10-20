import { describe, expect, it } from "vitest";
import { Verdict } from "@mandat/contract";
import { decideDelivery } from "@mandat/core";
import { autoMerge, branchFor, deliver, humanApproved } from "./deliver.js";
import type { DeliverInput } from "./deliver.js";
import { fakeGitHub } from "./fake.js";

const REPO = "mandat-demo/shop";
const verdict = (result: "VERIFIED" | "FAILED" | "UNKNOWN") =>
  Verdict.parse({
    run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: "t_demo", attempt: 1, agent: "claude", result, reasons: [], evidence: [{ detector: "D1.base_tests", phase: 1, status: "pass", summary: "ok", data: {}, source: "sandbox:verify", agent_visible: true }],
    contract_hash: `sha256:${"a".repeat(64)}`, base_sha: "a".repeat(40), tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
    usage: { usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-10-20T00:00:00.000Z",
  });
function setup(level: 0 | 1 | 2 | 3, attempt = 1) {
  const gh = fakeGitHub({ repos: { [REPO]: {} } });
  const base = gh.state.repos.get(REPO)?.head ?? "";
  const i: DeliverInput = { repo: REPO, base: "main", task_id: "t_demo", attempt, base_sha: base, tree_sha: "-", diffPatch: Buffer.from("diff"), verdict: verdict("VERIFIED"), effectiveLevel: level, levelReasons: [], ledgerSeq: 3, mode: "full" };
  return { gh, i, base };
}
const id = (s: string) => s;

describe("gate-level2-approval (fakeGitHub с ruleset)", () => {
  it("ниво 2 → PR не е чернова; Writer слага „Мандат approval“ преди mergePull; сливането минава", async () => {
    const { gh, i, base } = setup(2);
    const d = await deliver(gh, i, decideDelivery({ result: "VERIFIED", effectiveLevel: 2, mode: "full", origin: "mandat" }));
    expect(d).toMatchObject({ kind: "pr", draft: false, auto_merge: true, notify: true });
    if (d.kind !== "pr") return;
    const m = await autoMerge(gh, { repo: REPO, base: "main", number: d.number, head_sha: d.head_sha, base_sha: base, tree_sha_expected: gh.state.commits.get(d.head_sha)?.tree ?? "", task_id: "t_demo", level: 2, verdictSeq: 3, redact: id });
    expect(m).toMatchObject({ kind: "merged", tree_match: true });
    const order = gh.state.calls.filter((c) => c.startsWith("check") || c.startsWith("merge"));
    expect(order.findIndex((c) => c.includes("Мандат approval"))).toBeLessThan(order.findIndex((c) => c.startsWith("merge")));
  });
  it("без approval check → fakeGitHub връща 405; ниво 1 → humanMerge без одобрение → 405, с одобрение → ok", async () => {
    const { gh, i } = setup(2);
    const d = await deliver(gh, i, { kind: "pr_then_auto_merge", notify: true });
    if (d.kind !== "pr") throw new Error("pr");
    expect(await gh.mergePull(REPO, d.number, { sha: d.head_sha, merge_method: "squash" })).toMatchObject({ ok: false, status: 405 });
    const one = setup(1);
    const d1 = await deliver(one.gh, one.i, decideDelivery({ result: "VERIFIED", effectiveLevel: 1, mode: "full", origin: "mandat" }));
    expect(d1).toMatchObject({ kind: "pr", draft: true });
    if (d1.kind !== "pr") return;
    expect(await one.gh.humanMerge(REPO, d1.number)).toMatchObject({ ok: false, status: 405 });
    await humanApproved(one.gh, { repo: REPO, number: d1.number, head_sha: d1.head_sha, task_id: "t_demo", approvedBy: "simo", external: false });
    expect(await one.gh.humanMerge(REPO, d1.number)).toMatchObject({ ok: true });
  });
  it("ниво 0 → само клон; FAILED/UNKNOWN → нищо/hold", async () => {
    const { gh, i } = setup(0);
    expect(await deliver(gh, i, { kind: "branch_only" })).toMatchObject({ kind: "branch", ref: "mandat/t_demo-a1" });
    expect(gh.state.calls.some((c) => c.startsWith("createPull"))).toBe(false);
    expect(await deliver(gh, i, { kind: "none" })).toEqual({ kind: "none" });
    expect(await deliver(gh, i, { kind: "hold", wait_reason: "unknown" })).toEqual({ kind: "held", wait_reason: "unknown" });
  });
});

describe("merge-sha (409 → MIXED)", () => {
  it("head се мести между присъдата и сливането → mixed; никога сливане без присъда за точния head", async () => {
    const { gh, i, base } = setup(2);
    const d = await deliver(gh, i, { kind: "pr_then_auto_merge", notify: true });
    if (d.kind !== "pr") throw new Error("pr");
    gh.pushToPull(REPO, d.number, "f".repeat(40));
    expect(await autoMerge(gh, { repo: REPO, base: "main", number: d.number, head_sha: d.head_sha, base_sha: base, tree_sha_expected: "-", task_id: "t_demo", level: 2, verdictSeq: 3, redact: id })).toEqual({ kind: "mixed", reason: "head_moved" });
    expect(gh.state.calls.some((c) => c.startsWith("merge"))).toBe(false);
    expect(await gh.mergePull(REPO, d.number, { sha: d.head_sha, merge_method: "squash" })).toMatchObject({ ok: false, status: 409 });
  });
  it("base се е преместил → held base_moved; 405 → held merge_blocked (текстът след redaction)", async () => {
    const { gh, i, base } = setup(2);
    const d = await deliver(gh, i, { kind: "pr_then_auto_merge", notify: true });
    if (d.kind !== "pr") throw new Error("pr");
    expect(await autoMerge(gh, { repo: REPO, base: "main", number: d.number, head_sha: d.head_sha, base_sha: "e".repeat(40), tree_sha_expected: "-", task_id: "t_demo", level: 2, verdictSeq: 3, redact: id })).toEqual({ kind: "held", wait_reason: "base_moved" });
    const r = gh.state.repos.get(REPO);
    if (r) r.rules = { ...r.rules, requiredContexts: [...r.rules.requiredContexts, "test"] };
    const m = await autoMerge(gh, { repo: REPO, base: "main", number: d.number, head_sha: d.head_sha, base_sha: base, tree_sha_expected: "-", task_id: "t_demo", level: 2, verdictSeq: 3, redact: (s) => s.replace(/test/g, "[R]") });
    expect(m).toMatchObject({ kind: "held", wait_reason: "merge_blocked" });
    if (m.kind === "held") expect(m.message).toContain("[R]");
  });
});

describe("cas-ref (D-235)", () => {
  it("втори опит → нов ref -a2; съществуващ ref → 422 → BLOCKED branch_changed_by_human", async () => {
    const { gh, i } = setup(0);
    expect(await deliver(gh, i, { kind: "branch_only" })).toMatchObject({ ref: "mandat/t_demo-a1" });
    expect(await deliver(gh, { ...i, attempt: 2 }, { kind: "branch_only" })).toMatchObject({ ref: "mandat/t_demo-a2" });
    expect(await deliver(gh, i, { kind: "branch_only" })).toEqual({ kind: "blocked", reason: "branch_changed_by_human" });
    expect(branchFor("t_x", 3)).toBe("mandat/t_x-a3");
  });
});
