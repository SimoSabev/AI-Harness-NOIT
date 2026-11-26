import { describe, expect, it } from "vitest";
import { ProfileLayers, ProfileManifest, demoProfileLayers } from "@mandat/contract";
import type { ProfileLayers as Layers } from "@mandat/contract";
import { rulesFromFailures } from "./rules.js";
import type { AskRow, LearnFailureRow } from "./rules.js";

// E9д (spec 5.5, PRD 6.11 т. 2, D-641): failures and asks → proposals for a new profile version, each with its rule's
// name as origin. The eight D-530/D-549 classes come from packages/profile unchanged; flaky and asks are new.
const NOW = "2026-11-26T12:00:00.000Z";
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();
/** the demo profile without its deny on infra/**, so a recurring D4 there has something to propose */
const base = (): Layers => {
  const p = ProfileLayers.parse(demoProfileLayers());
  return { ...p, c: p.c.filter((r) => !r.tool.startsWith("path:write:infra")) };
};
const fail = (task_id: string, reasons: string[], o: { d?: number; label?: LearnFailureRow["label"]; type?: LearnFailureRow["task_type"] } = {}): LearnFailureRow => ({ task_id, task_type: o.type ?? "bugfix", at: daysAgo(o.d ?? 1), reasons, label: o.label ?? null });
const ask = (task_id: string, tool: string, status: AskRow["status"], d = 1): AskRow => ({ task_id, task_type: "feature", tool, status, at: daysAgo(d) });
const NOT_AGENT = { layer: "verification", label: "flaky test" } as const;

describe("rulesFromFailures (AC-11.1)", () => {
  it("three FAILED D4:out_of_contract:infra/** in 30 days → add infra/** to the protected paths, origin rule:d4_repeat", () => {
    const rows = [1, 2, 3].map((i) => fail(`t_${i}`, ["D4:out_of_contract:infra/**"], { d: i * 9 }));
    const out = rulesFromFailures({ failures: rows, asks: [] }, base(), NOW);
    expect(out).toEqual([{ weakens: false, manifest: { change: { rule: "protect_path", layer: "c", detail: "infra/**" }, evidence: ["t_1", "t_2", "t_3"], reason_class: "D4:out_of_contract", prediction: { task_type: "bugfix", next_n: 10, max_repeats: 0 }, source: "rule:d4_repeat" } }]);
    expect(ProfileManifest.parse(out[0]?.manifest)).toEqual(out[0]?.manifest);
  });

  it("two in 30 days, or the third older than 30 days, is not enough", () => {
    expect(rulesFromFailures({ failures: [fail("t_1", ["D4:out_of_contract:infra/**"]), fail("t_2", ["D4:out_of_contract:infra/**"])], asks: [] }, base(), NOW)).toEqual([]);
    expect(rulesFromFailures({ failures: [fail("t_1", ["D4:out_of_contract:infra/**"]), fail("t_2", ["D4:out_of_contract:infra/**"]), fail("t_3", ["D4:out_of_contract:infra/**"], { d: 31 })], asks: [] }, base(), NOW)).toEqual([]);
  });

  it("every D-530/D-549 class carries its rule name", () => {
    const rows = [1, 2, 3].flatMap((i) => [fail(`t_a${i}`, ["D2:missing_test:x > y"]), fail(`t_b${i}`, ["D13:hidden_probe:-"])]);
    expect(rulesFromFailures({ failures: rows, asks: [] }, base(), NOW).map((r) => r.manifest.source).sort()).toEqual(["rule:d2_repeat", "rule:hidden_probe_repeat"]);
  });
});

describe("flaky (spec 5.5: 2× flaky → tests.flaky)", () => {
  const T = "tests/cart.test.ts > adds an item";
  it("a test that failed D1 in two tasks a person labelled as not the agent's → tests.flaky, a change that can weaken (D-647)", () => {
    const out = rulesFromFailures({ failures: [fail("t_1", [`D1:regression:${T}`], { label: NOT_AGENT }), fail("t_2", [`D1:regression:${T}`], { label: { layer: "infra", label: "x" }, type: "feature" })], asks: [] }, base(), NOW);
    expect(out).toEqual([{ weakens: true, manifest: { change: { rule: "flaky_test", layer: "a", detail: T }, evidence: ["t_1", "t_2"], reason_class: "D1:regression", prediction: { task_type: "bugfix", next_n: 10, max_repeats: 0 }, source: "rule:flaky_repeat" } }]);
  });

  it("an unlabelled or agent-labelled regression is a real one: nothing; a test already flaky: nothing; once: nothing", () => {
    const agent = { layer: "agent", label: "broke it" };
    expect(rulesFromFailures({ failures: [fail("t_1", [`D1:regression:${T}`]), fail("t_2", [`D1:regression:${T}`], { label: agent })], asks: [] }, base(), NOW)).toEqual([]);
    const p = base();
    const flaky = { ...p, a: { ...p.a, tests: { ...p.a.tests, flaky: [T] } } };
    expect(rulesFromFailures({ failures: [fail("t_1", [`D1:regression:${T}`], { label: NOT_AGENT }), fail("t_2", [`D1:regression:${T}`], { label: NOT_AGENT })], asks: [] }, flaky, NOW)).toEqual([]);
    expect(rulesFromFailures({ failures: [fail("t_1", [`D1:regression:${T}`, `D1:regression:${T}`], { label: NOT_AGENT })], asks: [] }, base(), NOW)).toEqual([]);
    // a name that is not a test id never becomes one
    expect(rulesFromFailures({ failures: [fail("t_1", ["D1:regression:nope"], { label: NOT_AGENT }), fail("t_2", ["D1:regression:nope"], { label: NOT_AGENT })], asks: [] }, base(), NOW)).toEqual([]);
  });
});

describe("asks (spec 5.5: 5× ask for one tool → allow / deny)", () => {
  it("five tasks where a person let the tool through → allow (newest first); five denials → deny; an allow can weaken, a deny cannot (D-647)", () => {
    const granted = ["t_1", "t_2", "t_3", "t_4", "t_5"].map((t, i) => ask(t, "bash:pnpm add *", i % 2 ? "once" : "always", i + 1));
    const out = rulesFromFailures({ failures: [], asks: granted }, base(), NOW);
    expect(out).toEqual([{ weakens: true, manifest: { change: { rule: "tool_allow", layer: "c", detail: "bash:pnpm add *" }, evidence: ["t_1", "t_2", "t_3", "t_4", "t_5"], reason_class: "ASK:tool_ask", prediction: { task_type: "feature", next_n: 10, max_repeats: 0 }, source: "rule:ask_repeat" } }]);
    const denied = ["t_1", "t_2", "t_3", "t_4", "t_5"].map((t) => ask(t, "net:api.segment.io", "denied"));
    const d = rulesFromFailures({ failures: [], asks: denied }, base(), NOW)[0];
    expect([d?.manifest.change, d?.weakens]).toEqual([{ rule: "tool_deny", layer: "c", detail: "net:api.segment.io" }, false]);
  });

  it("four tasks, a split decision, pending asks, one task asking five times: nothing", () => {
    const four = ["t_1", "t_2", "t_3", "t_4"].map((t) => ask(t, "bash:ls", "once"));
    expect(rulesFromFailures({ failures: [], asks: four }, base(), NOW)).toEqual([]);
    const split = [...four, ask("t_5", "bash:ls", "denied"), ask("t_6", "bash:ls", "denied")];
    expect(rulesFromFailures({ failures: [], asks: split }, base(), NOW)).toEqual([]);
    expect(rulesFromFailures({ failures: [], asks: [...four, ask("t_5", "bash:ls", "pending")] }, base(), NOW)).toEqual([]);
    expect(rulesFromFailures({ failures: [], asks: [1, 2, 3, 4, 5].map((i) => ask("t_1", "bash:ls", "once", i)) }, base(), NOW)).toEqual([]);
  });

  it("a way out (net:*, git push) is never proposed as allow; a tool the profile already rules that way: nothing", () => {
    for (const tool of ["net:evil.example", "bash:git push origin main"]) {
      expect(rulesFromFailures({ failures: [], asks: [1, 2, 3, 4, 5].map((i) => ask(`t_${i}`, tool, "once")) }, base(), NOW)).toEqual([]);
    }
    const p = base();
    const ruled = { ...p, c: [...p.c, { subject: "any", tool: "bash:ls", decision: "allow", reason: "x" }] } as Layers;
    expect(rulesFromFailures({ failures: [], asks: [1, 2, 3, 4, 5].map((i) => ask(`t_${i}`, "bash:ls", "once")) }, ruled, NOW)).toEqual([]);
  });

  it("an old ask, a bad time or a tool that is not a pattern does not count", () => {
    const rows = [ask("t_1", "bash:ls", "once", 40), ...[2, 3, 4, 5].map((i) => ask(`t_${i}`, "bash:ls", "once")), { ...ask("t_6", "bash:ls", "once"), at: "x" }];
    expect(rulesFromFailures({ failures: [], asks: rows }, base(), NOW)).toEqual([]);
    expect(rulesFromFailures({ failures: [], asks: [1, 2, 3, 4, 5].map((i) => ask(`t_${i}`, "rm -rf /", "denied")) }, base(), NOW)).toEqual([]);
  });
});
