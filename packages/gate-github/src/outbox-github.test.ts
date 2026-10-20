import { describe, expect, it } from "vitest";
import { githubEffectHandlers } from "./effects.js";
import { fakeGitHub } from "./fake.js";

// T3-2: a crash between commit and effect → after restart the check run exists exactly once (found by external_id).
describe("outbox-github", () => {
  it("повторено изпълнение на същия ред → един check run", async () => {
    const gh = fakeGitHub({ repos: { "o/r": {} } });
    const h = githubEffectHandlers(gh);
    const row = { kind: "check_run", idempotency_key: "t_a:1:check_run:1", payload: { repo: "o/r", check: { name: "Мандат verdict", head_sha: "a".repeat(40), external_id: "t_a", conclusion: "failure", title: "FAILED", summary: "s" } } };
    await h.check_run(row);
    await h.check_run(row); // the worker died after the effect, before marking the row done
    expect(gh.state.checks.filter((c) => c.external_id === "t_a")).toHaveLength(1);
    await expect(h.check_run({ ...row, payload: { repo: "o/r" } })).rejects.toThrow(/without check/);
  });
});
