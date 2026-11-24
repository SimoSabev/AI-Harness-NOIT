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

/** D-566: the public API the oracle fixed (its API.md): one item per top-level "- " line, at most 60 */
export const ORACLE_API_MAX = 60;
/** D-571: an item keeps the lines under it (its rules, nested points), joined, up to this many chars */
export const ORACLE_API_ITEM_MAX = 1000;
export function parseOracleApi(md: string): string[] {
  const items: string[][] = [];
  let open = false;
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("- ")) {
      items.push([line.slice(2).trim()]);
      open = true;
    } else if (line.trim() === "" || line.startsWith("#")) open = line.trim() === "" && open;
    else if (open && /^\s/.test(line)) items[items.length - 1]?.push(line.trim());
    else open = false;
  }
  return items
    .map((parts) => parts.filter((p) => p !== "").join(" ").slice(0, ORACLE_API_ITEM_MAX))
    .filter((l) => l !== "")
    .slice(0, ORACLE_API_MAX);
}

/** D-566: a writer's text with the API the hidden checks use, as a requirement (the tests themselves stay hidden) */
export function withApi(text: string, api: readonly string[], max: number = CHAT_TEXT_MAX): string {
  const block = apiBlock(api, max);
  if (block === "") return text;
  // the API always fits: the end of the text (the list of other criteria) gives way to it
  return `${text.slice(0, max - block.length)}${block}`;
}

/** D-571: the API block takes up to 3/4 of a text of `max` chars; it keeps whole items and says how many did not fit
 *  (half the text cut the live test's 2349-char API in the middle of its fourth item) */
export function apiBlock(api: readonly string[], max: number): string {
  if (api.length === 0) return "";
  const cap = Math.floor((max * 3) / 4);
  const lines = api.map((a) => `- ${a}`);
  const render = (k: number): string =>
    ["\nPublic API the hidden checks use (provide exactly these exports):", ...lines.slice(0, k), ...(k < lines.length ? [`- … ${lines.length - k} more item(s) did not fit`] : [])].join("\n");
  let k = lines.length;
  while (k > 0 && render(k).length > cap) k--;
  return render(k).slice(0, cap);
}

/** the oracle agent's task text: tests only, one tag per test, only in __hidden__ folders the runner finds (≤ 4000 chars) */
export function oracleTaskText(s: Spec, max: number = CHAT_TEXT_MAX): string {
  const head: string[] = [
    "Write hidden acceptance tests for the spec below. Do not implement anything.",
    `Write only new test files (*.spec.ts or *.test.ts) and put them in a ${HIDDEN_SEGMENT} folder inside a directory the project's test runner already discovers: look at the test config (e.g. vitest.workspace / vitest.config / jest config / the package test scripts); in a monorepo that is usually inside a package, e.g. packages/<name>/test/${HIDDEN_SEGMENT}/. Do not change any other file.`,
    // D-566 (live test 21.11): tests that guessed new names by regex could not pass whatever the writers built
    `Decide the public API of the new code yourself and import it by exact paths and names; never discover names with import.meta.glob, regular expressions or try/catch. Import modules that do not exist yet inside each test with await import("<exact relative path>"), so the file still loads on the current code and each test fails on its own; existing modules may be imported at the top. Write that API into ${HIDDEN_SEGMENT}/API.md next to your tests, one export per line: - \`path\`: \`name(args): result\` — what it does. List every new function your tests call (also new functions in existing modules) and every new field they read: the writers get only this list (never your tests), so a name you leave out keeps the oracle from being ready.`,
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
  for (let cut = 400; text.length > max && cut >= 20; cut -= 10) text = render(cut);
  return text.slice(0, max);
}

/** a mutant of the work's code that every hidden test let through (D11.mutation evidence) */
export const SurvivedMutant = z.object({ path: z.string().max(400), line: z.number().int().min(1), from: z.string().max(400), to: z.string().max(400) });
export type SurvivedMutant = z.infer<typeof SurvivedMutant>;

/** live test 24.11.2026 (D-592): an oracle built again after a parked job learns which changes to the work's code its tests
 *  did not notice; at most 5, each part shortened, so the spec keeps its room */
export function survivedNote(ms: readonly SurvivedMutant[]): string {
  if (ms.length === 0) return "";
  const cut = (x: string, n: number) => (x.length > n ? `${x.slice(0, n)}…` : x);
  const list = ms.slice(0, 5).map((m) => `- ${cut(m.path, 120)}:${m.line} ${cut(m.from, 40)} → ${cut(m.to, 40)}`);
  return [
    "",
    "",
    "The last work on this spec passed every hidden test even with these changes to its code (surviving mutants), so the tests did not notice them:",
    ...list,
    "Add assertions that fail on each: check the exact values the API returns, also on error paths, not only side effects.",
  ].join("\n");
}

/** building → the oracle agent runs; not_ready → the result lists why; ready → a person may approve; failed → no output */
export const OracleStatus = z.enum(["building", "not_ready", "ready", "approved", "failed"]);
export type OracleStatus = z.infer<typeof OracleStatus>;

export const OracleProblemKind = z.enum(["no_tests", "non_test_change", "untagged_test", "unknown_tag", "untagged_criterion", "green_on_base", "unchanged_untagged", "unchanged_red", "not_run", "not_discovered", "no_api"]);
export const OracleProblem = z.object({ kind: OracleProblemKind, id: z.string().max(300) }).strict();
export type OracleProblem = z.infer<typeof OracleProblem>;

export const OracleApproveBody = z.object({ oracle_hash: Sha256 }).strict();

/** D-593 (live test 24.11.2026): "Build oracle again" may carry a person's note on what the last oracle got wrong */
export const ORACLE_NOTE_MAX = 1000;
export const OracleBuildBody = z.object({ note: z.string().trim().max(ORACLE_NOTE_MAX).optional() }).strict();
export type OracleBuildBody = z.infer<typeof OracleBuildBody>;
/** the person's note as the oracle agent reads it (their words, after the spec); nothing for no note */
export function personNote(note: string | undefined): string {
  const n = note?.trim() ?? "";
  return n === "" ? "" : `\n\nA person who read the last oracle says what it got wrong; follow it where it agrees with the spec:\n${n}`;
}

/** D-534: a writer's mutants must be killed by the hidden tests at least this often, or the verdict is not VERIFIED */
export const ORACLE_MIN_KILL = 0.6;
