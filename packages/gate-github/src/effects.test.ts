import { describe, expect, it } from "vitest";
import { githubEffectHandlers } from "./effects.js";
import { fakeGitHub } from "./fake.js";

describe("githubEffectHandlers", () => {
  it("ready, approval, merge; липсващи полета → грешка", async () => {
    const gh = fakeGitHub({ repos: { "o/r": {} }, pulls: [{ repo: "o/r", pull: { number: 1, head_sha: "a".repeat(40), draft: true } }] });
    const h = githubEffectHandlers(gh);
    await h.ready_for_review({ kind: "ready_for_review", idempotency_key: "k", payload: { repo: "o/r", number: 1 } });
    expect((await gh.getPull("o/r", 1)).draft).toBe(false);
    await h.approval_check({ kind: "approval_check", idempotency_key: "k", payload: { repo: "o/r", check: { name: "Мандат approval", head_sha: "a".repeat(40), external_id: "t", conclusion: "success", title: "ok", summary: "s" } } });
    await expect(h.merge({ kind: "merge", idempotency_key: "k", payload: { repo: "o/r", number: 1, sha: "b".repeat(40) } })).rejects.toThrow(/merge 409/);
    await h.merge({ kind: "merge", idempotency_key: "k", payload: { repo: "o/r", number: 1, sha: "a".repeat(40) } }); // 405 (no verdict check) is swallowed
    for (const k of ["approval_check", "ready_for_review", "merge"] as const) await expect(h[k]({ kind: k, idempotency_key: "k", payload: { repo: "o/r" } })).rejects.toThrow(/without/);
  });
});
