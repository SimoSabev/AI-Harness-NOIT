import { HarnessProfile, Materialized } from "@mandat/contract";
import type { CompileTarget } from "@mandat/contract";
import { compileClaude } from "./claude.js";
import { compileCodex } from "./codex.js";
import { HARNESS_ALWAYS, instructions, policyJson, rulesFor } from "./common.js";
import type { CompileCtx } from "./common.js";
import { RULES, ruleKind } from "./rules.js";

/** v5 т. 4.1: a pure function from the profile to one agent's control layer (files under /m/in/harness, argv, env). */
export function compileProfile(profile: HarnessProfile, target: CompileTarget, ctx: CompileCtx): Materialized {
  const p = HarnessProfile.parse(profile);
  if (target === "claude") return Materialized.parse(compileClaude(p, ctx));
  if (target === "codex") return Materialized.parse(compileCodex(p, ctx));
  // Gemini (E9в) and a local model: the instructions and the policy for the harness; the rest is the harness or nothing
  const rules = rulesFor(p, ctx.subjects);
  return Materialized.parse({
    files: [
      { path: "instructions.md", bytes: instructions(p), mode: "0444" },
      { path: "policy.json", bytes: policyJson(p, ctx), mode: "0444" },
    ],
    argv: [],
    env: {},
    enforced_by_harness: [
      ...rules.filter((r) => RULES[ruleKind(r.tool)][target] === "harness").map((r) => ({ rule: r.tool, why: ruleKind(r.tool) === "bash" ? "no network and no credentials in the sandbox; only the harness delivers" : "the egress gate and D4" })),
      ...HARNESS_ALWAYS,
    ],
    unsupported: [
      ...rules.filter((r) => RULES[ruleKind(r.tool)][target] === "unsupported").map((r) => ({ rule: r.tool, why: `${target}: not compiled yet (E9в)` })),
      { rule: "hooks", why: `${target}: not compiled yet (E9в)` },
      ...p.layers.e.mcp.map((m) => ({ rule: `mcp server ${m.name}`, why: `${target}: not compiled yet (E9в)` })),
    ],
  });
}
