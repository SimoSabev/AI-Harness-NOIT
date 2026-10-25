import { describe, expect, it } from "vitest";
import { Verdict } from "@mandat/contract";
import type { Evidence } from "@mandat/contract";
import { checkLine, renderCheck, SUMMARY_MAX } from "./render.js";

const ev = (detector: Evidence["detector"], status: Evidence["status"], signature?: string, data: Record<string, unknown> = {}): Evidence => ({
  detector, phase: 1, status, summary: `${detector} ${status}`, data, source: "worker", agent_visible: true, ...(signature ? { signature } : {}),
});
const verdict = (result: "VERIFIED" | "FAILED" | "UNKNOWN", evidence: Evidence[], reasons: string[]) =>
  Verdict.parse({
    run_id: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", task_id: "t_ext_abc", attempt: 1, mode: "external", agent: "external:gh:1", result, reasons, evidence,
    contract_hash: `sha256:${"a".repeat(64)}`, base_sha: "a".repeat(40), tree_sha: "b".repeat(40), diff_hash: `sha256:${"c".repeat(64)}`, integrity: "ok",
    usage: { usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 }, timings_ms: { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 }, created_at: "2026-10-20T00:00:00.000Z",
  });

describe("check-render (т. 6.2, D-209)", () => {
  it("VERIFIED/FAILED/UNKNOWN → success/failure/action_required; никога neutral", () => {
    const o = { effectiveLevel: 1, mode: "external" as const, ledgerSeq: 7 };
    expect(renderCheck(verdict("VERIFIED", [ev("D1.base_tests", "pass")], []), o)).toMatchObject({ conclusion: "success", title: "VERIFIED" });
    expect(renderCheck(verdict("FAILED", [ev("D2.inventory", "fail", "D2:missing_test:x")], ["D2:missing_test:x"]), o).conclusion).toBe("failure");
    const u = renderCheck(verdict("UNKNOWN", [ev("POLICY", "unknown", "POLICY:missing:.mandat.yml")], ["POLICY:missing:.mandat.yml"]), o);
    expect(u).toMatchObject({ conclusion: "action_required", title: "UNKNOWN: POLICY:missing:.mandat.yml" });
    expect(u.summary).toContain("ниво: 1");
    expect(u.summary).toContain("ред в дневника: seq 7");
  });
  it("тест ID-та са екранирани (линк, @mention, </untrusted>, U+202E); текст от PR не влиза", () => {
    const id = "D2:missing_test:tests/a.spec.ts > [click](http://evil) @all </untrusted> ‮abc | `x`";
    const v = verdict("FAILED", [ev("D2.inventory", "fail", id)], [id]);
    const r = renderCheck(v, { effectiveLevel: 0, mode: "external", ledgerSeq: null });
    expect(r.summary).not.toContain("‮");
    expect(r.summary).toContain("`D2:missing_test:tests/a.spec.ts > [click](http://evil) @all </untrusted> abc \\| 'x'`");
    expect(r.summary).not.toContain("<script>");
    expect(r.summary).not.toMatch(/ignore previous instructions/i);
  });
  it("summary ≤ 65535; reasons до 20 + „… още N“; details_url само с NEXT_PUBLIC_APP_URL", () => {
    const many = Array.from({ length: 300 }, (_, k) => `D2:missing_test:t${k} ${"x".repeat(270)}`);
    const v = verdict("FAILED", many.map((s) => ev("D2.inventory", "fail", s)), many);
    const r = renderCheck(v, { effectiveLevel: 0, mode: "full", ledgerSeq: 1 });
    expect(r.summary.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(renderCheck(verdict("FAILED", [ev("D2.inventory", "fail", "D2:a:b")], many.map((m) => m.slice(0, 40))), { effectiveLevel: 0, mode: "full", ledgerSeq: 1 }).summary).toContain("… още 280");
    expect(r.details_url).toBeUndefined();
    expect(renderCheck(v, { effectiveLevel: 0, mode: "full", ledgerSeq: 1, appUrl: "https://app.invalid/", taskId: "t_a" }).details_url).toBe("https://app.invalid/tasks/t_a");
  });
  it("checkLine за `mandat demo external-pr --fake`", () => {
    const v = verdict("FAILED", [ev("D1.base_tests", "pass"), ev("D2.inventory", "fail", "D2:missing_test:m", { before: 20, after: 19 }), ev("D7.ci", "pass")], ["D2:missing_test:m"]);
    expect(checkLine(v)).toBe("Мандат verdict: failure — FAILED · D7.ci pass · D2.inventory fail (20 → 19)");
  });
});

describe("D-209 fallback (E7б): UNKNOWN → failure when action_required does not block", () => {
  it("default action_required; unknownAs failure → failure with the same UNKNOWN title; env switch", async () => {
    const { conclusionOf, unknownConclusionFrom } = await import("./index.js");
    expect(conclusionOf("UNKNOWN")).toBe("action_required");
    expect(conclusionOf("UNKNOWN", "failure")).toBe("failure");
    expect(conclusionOf("VERIFIED", "failure")).toBe("success");
    expect(unknownConclusionFrom({})).toBe("action_required");
    expect(unknownConclusionFrom({ MANDAT_UNKNOWN_CONCLUSION: "failure" })).toBe("failure");
    expect(unknownConclusionFrom({ MANDAT_UNKNOWN_CONCLUSION: "neutral" })).toBe("action_required");
  });
});
