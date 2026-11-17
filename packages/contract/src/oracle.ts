import { z } from "zod";
import { CHAT_TEXT_MAX } from "./conversation.js";
import { Sha256 } from "./schemas.js";
import type { Spec } from "./task-spec.js";

// D-534 (М1 Х3, docs/prd/heavy-process.md §3): the oracle. After a person approves a spec, a separate agent writes the
// hidden acceptance tests from its criteria; the writer never sees them. Shared here: the oracle agent's instruction,
// the test tags it must use, the oracle's states and the approve body.

/** where the oracle agent writes its tests in its own tree; the stored paths are relative to this directory */
export const ORACLE_DIR = "tests/__hidden__";

/** "AC-<n>:" tags a criterion test, "U-<n>:" a test that pins the n-th unchanged behavior (1-based) */
const TAG = /(?:^| > )((?:AC|U)-[1-9]\d{0,3}):/;
export function oracleTag(testId: string): string | null {
  return TAG.exec(testId)?.[1] ?? null;
}
export const unchangedId = (n: number): string => `U-${n + 1}`;

/** the oracle agent's task text: tests only, one tag per test, nothing outside the oracle directory (≤ 4000 chars) */
export function oracleTaskText(s: Spec): string {
  const head = [
    "Write hidden acceptance tests for the spec below. Do not implement anything.",
    `Write only new test files under ${ORACLE_DIR}/ (vitest, *.spec.ts or *.test.ts). Do not change any other file.`,
    "For each acceptance criterion write at least one test whose name starts with its id, e.g. it(\"AC-1: ...\").",
    "These tests must FAIL on the current code: they describe behavior that does not exist yet.",
    "For each unchanged behavior write at least one test whose name starts with its id, e.g. it(\"U-1: ...\").",
    "These tests must PASS on the current code: they pin what must stay as it is.",
    "Every test name starts with exactly one id. Import the code under test by relative paths from your test file.",
    `Goal: ${s.goal}`,
    "Acceptance criteria:",
    ...s.criteria.map((c) => `${c.id}: WHEN ${c.when.trim()} THE SYSTEM SHALL ${c.shall.trim()} (proof: ${c.proof})`),
    "Unchanged behavior:",
    ...(s.unchanged.length > 0 ? s.unchanged.map((u, n) => `${unchangedId(n)}: ${u}`) : ["-"]),
  ].join("\n");
  return head.slice(0, CHAT_TEXT_MAX);
}

/** building → the oracle agent runs; not_ready → the result lists why; ready → a person may approve; failed → no output */
export const OracleStatus = z.enum(["building", "not_ready", "ready", "approved", "failed"]);
export type OracleStatus = z.infer<typeof OracleStatus>;

export const OracleProblemKind = z.enum(["no_tests", "non_test_change", "untagged_test", "unknown_tag", "untagged_criterion", "green_on_base", "unchanged_untagged", "unchanged_red", "not_run"]);
export const OracleProblem = z.object({ kind: OracleProblemKind, id: z.string().max(300) }).strict();
export type OracleProblem = z.infer<typeof OracleProblem>;

export const OracleApproveBody = z.object({ oracle_hash: Sha256 }).strict();

/** D-534: a writer's mutants must be killed by the hidden tests at least this often, or the verdict is not VERIFIED */
export const ORACLE_MIN_KILL = 0.6;
