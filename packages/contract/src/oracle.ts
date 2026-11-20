import { z } from "zod";
import { CHAT_TEXT_MAX } from "./conversation.js";
import { Sha256 } from "./schemas.js";
import type { Spec } from "./task-spec.js";
import { HIDDEN_SEGMENT } from "./hidden-path.js";

// D-534 (М1 Х3, docs/prd/heavy-process.md §3): the oracle. After a person approves a spec, a separate agent writes the
// hidden acceptance tests from its criteria; the writer never sees them. Shared here: the oracle agent's instruction,
// the test tags it must use, the oracle's states and the approve body.

export { HIDDEN_SEGMENT, hiddenFileOf, hiddenRootPath, isHiddenPath } from "./hidden-path.js";

/** D-536: the oracle agent writes its tests into `__hidden__` folders at any depth; the stored paths are from the repo root */
export const ORACLE_GLOB = `**/${HIDDEN_SEGMENT}/**`;

/** "AC-<n>:" tags a criterion test, "U-<n>:" a test that pins the n-th unchanged behavior (1-based) */
const TAG = /(?:^| > )((?:AC|U)-[1-9]\d{0,3}):/;
export function oracleTag(testId: string): string | null {
  return TAG.exec(testId)?.[1] ?? null;
}
export const unchangedId = (n: number): string => `U-${n + 1}`;

/** the oracle agent's task text: tests only, one tag per test, only in __hidden__ folders the runner finds (≤ 4000 chars) */
export function oracleTaskText(s: Spec): string {
  const head: string[] = [
    "Write hidden acceptance tests for the spec below. Do not implement anything.",
    `Write only new test files (*.spec.ts or *.test.ts) and put them in a ${HIDDEN_SEGMENT} folder inside a directory the project's test runner already discovers: look at the test config (e.g. vitest.workspace / vitest.config / jest config / the package test scripts); in a monorepo that is usually inside a package, e.g. packages/<name>/test/${HIDDEN_SEGMENT}/. Do not change any other file.`,
    "For each acceptance criterion write at least one test whose name starts with its id, e.g. it(\"AC-1: ...\").",
    "These tests must FAIL on the current code: they describe behavior that does not exist yet.",
    "For each unchanged behavior write at least one test whose name starts with its id, e.g. it(\"U-1: ...\").",
    "These tests must PASS on the current code: they pin what must stay as it is.",
    "Every test name starts with exactly one id; import the code under test by relative paths from your test file.",
    `Goal: ${s.goal}`,
  ];
  const crit = s.criteria.map((c) => ({ id: c.id, text: `WHEN ${c.when.trim()} THE SYSTEM SHALL ${c.shall.trim()} (proof: ${c.proof})` }));
  const unch = s.unchanged.map((u, n) => ({ id: unchangedId(n), text: u.trim() }));
  const render = (cut: number | null): string => {
    const line = (x: { id: string; text: string }) => `${x.id}: ${cut !== null && x.text.length > cut ? `${x.text.slice(0, cut)}…` : x.text}`;
    return [...head, "Acceptance criteria:", ...crit.map(line), "Unchanged behavior:", ...(unch.length > 0 ? unch.map(line) : ["-"])].join("\n");
  };
  // live test 20.11: a long spec was cut at its end, so the last unchanged behaviors never reached the agent; now every
  // line keeps its id and long lines are shortened evenly until the whole text fits the task
  let text = render(null);
  for (let cut = 400; text.length > CHAT_TEXT_MAX && cut >= 20; cut -= 10) text = render(cut);
  return text.slice(0, CHAT_TEXT_MAX);
}

/** building → the oracle agent runs; not_ready → the result lists why; ready → a person may approve; failed → no output */
export const OracleStatus = z.enum(["building", "not_ready", "ready", "approved", "failed"]);
export type OracleStatus = z.infer<typeof OracleStatus>;

export const OracleProblemKind = z.enum(["no_tests", "non_test_change", "untagged_test", "unknown_tag", "untagged_criterion", "green_on_base", "unchanged_untagged", "unchanged_red", "not_run", "not_discovered"]);
export const OracleProblem = z.object({ kind: OracleProblemKind, id: z.string().max(300) }).strict();
export type OracleProblem = z.infer<typeof OracleProblem>;

export const OracleApproveBody = z.object({ oracle_hash: Sha256 }).strict();

/** D-534: a writer's mutants must be killed by the hidden tests at least this often, or the verdict is not VERIFIED */
export const ORACLE_MIN_KILL = 0.6;
