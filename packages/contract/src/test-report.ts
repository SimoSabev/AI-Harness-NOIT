import path from "node:path";
import { z } from "zod";
import { parseXml } from "./xml-lite.js";
import type { XmlElement } from "./xml-lite.js";
import { MAX_REPORT_BYTES, VitestJsonReport } from "./vitest-report.js";
import type { ParsedReport, TestStatus } from "./vitest-report.js";

// E10 languages (D-680): TestReport is Mandat's one report format. Every runner's own output (vitest/jest JSON, the
// node --test reporter, pytest junit, `go test -json`, libtest JSON) is turned into it by a pure adapter on the host;
// the detectors (D1, D2, D5, D11, D14, MUST_PASS) only ever read what it becomes (ParsedReport, the test id → status map).
// A test id stays D-025: "<file> > <suite…> > <name>", where <file> is the test file relative to the tree root
// (Go: the package directory relative to the module, "." for the root; Rust: the cargo target, e.g. "src/lib.rs").

export const TestReportTool = z.enum(["vitest", "jest", "node-test", "pytest", "go", "cargo"]);
export type TestReportTool = z.infer<typeof TestReportTool>;
export const TestCaseStatus = z.enum(["passed", "failed", "skipped", "pending", "todo", "disabled"]);
export const TestCase = z
  .object({
    file: z.string().max(1000),
    suite: z.array(z.string().max(1000)).max(64),
    name: z.string().max(2000),
    status: TestCaseStatus,
    duration_ms: z.number().finite().nonnegative().optional(),
  })
  .strict();
export type TestCase = z.infer<typeof TestCase>;
export const TestReport = z
  .object({ version: z.literal(1), tool: TestReportTool, success: z.boolean(), tests: z.array(TestCase).max(200_000) })
  .strict();
export type TestReport = z.infer<typeof TestReport>;

/** What the test command writes to $MANDAT_REPORT (RepoConfig.tests.format). */
export const ReportFormat = z.enum(["vitest-json", "jest-json", "node-test", "pytest-junit", "go-test-json", "libtest-json"]);
export type ReportFormat = z.infer<typeof ReportFormat>;
export type AdapterResult = { ok: true; report: TestReport } | { ok: false; error: "json" | "schema" | "xml"; detail: string };
export interface ReportContext {
  /** the tree root inside the sandbox ("/m/work") */
  workRoot: string;
  /** Go: the module path of go.mod (package import paths are made relative to it) */
  goModule?: string;
}

export const testCaseId = (c: Pick<TestCase, "file" | "suite" | "name">): string => [c.file, ...c.suite, c.name].join(" > ");

/** TestReport → the detectors' view. Duplicate ids are a broken report (D-124: total = distinct ids). */
export function parsedFromTestReport(r: TestReport): ParsedReport {
  const tests = new Map<string, TestStatus>();
  const durations = new Map<string, number>();
  for (const c of r.tests) {
    const id = testCaseId(c);
    if (tests.has(id)) return { valid: false, error: "duplicate_id", detail: id };
    tests.set(id, c.status);
    if (c.duration_ms !== undefined) durations.set(id, c.duration_ms);
  }
  return { valid: true, success: r.success, total: tests.size, tests, durations };
}

const finiteMs = (x: unknown, scale: number): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x * scale : undefined);
const withMs = (ms: number | undefined) => (ms === undefined ? {} : { duration_ms: ms });
const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0];
  return i ? `${i.path.join(".")}: ${i.message}` : "invalid";
};

/** vitest 5 / jest --json / the node --test reporter (D-301, D-358): the same shape, unknown fields pass through. */
export function vitestToTestReport(raw: string, workRoot: string, tool: "vitest" | "jest" | "node-test" = "vitest"): AdapterResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: "json", detail: e instanceof Error ? e.message : String(e) };
  }
  const r = VitestJsonReport.safeParse(json);
  if (!r.success) return { ok: false, error: "schema", detail: firstIssue(r.error) };
  const tests: TestCase[] = [];
  for (const file of r.data.testResults) {
    const rel = path.posix.relative(workRoot, file.name);
    for (const a of file.assertionResults) tests.push({ file: rel, suite: a.ancestorTitles, name: a.title, status: a.status, ...withMs(finiteMs((a as { duration?: unknown }).duration, 1)) });
  }
  return { ok: true, report: { version: 1, tool, success: r.data.success, tests } };
}

const RANK: Record<TestStatus, number> = { passed: 0, todo: 1, disabled: 1, pending: 1, skipped: 2, failed: 3 };
const relTo = (workRoot: string, f: string): string => {
  const p = f.replace(/\\/g, "/");
  const rel = p.startsWith("/") ? path.posix.relative(workRoot, p) : p;
  return rel.replace(/^(\.\/)+/, "");
};
function descendants(e: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of e.children) {
    if (c.name === name) out.push(c);
    else descendants(c, name, out);
  }
  return out;
}

/**
 * pytest `--junitxml` with `-o junit_family=xunit1` (the default xunit2 has no file= attribute, D-680). The suite is the
 * classname after the module (tests.test_cart.TestCart → [TestCart]); a collection error is a testcase with an empty
 * classname and the module as its name. pytest may write one test twice (a teardown error after a passing call): the
 * worse status counts.
 */
export function pytestJunitToTestReport(raw: string, workRoot: string): AdapterResult {
  const doc = parseXml(raw);
  if (!doc.ok) return { ok: false, error: "xml", detail: doc.detail };
  const root = doc.root;
  if (root.name !== "testsuites" && root.name !== "testsuite") return { ok: false, error: "schema", detail: `root <${root.name}>` };
  const suites = root.name === "testsuite" ? [root] : descendants(root, "testsuite");
  let declaredBad = 0;
  for (const s of suites) declaredBad += Number(s.attrs.errors ?? 0) + Number(s.attrs.failures ?? 0);
  const byId = new Map<string, TestCase>();
  for (const tc of descendants(root, "testcase")) {
    const file = tc.attrs.file;
    if (file === undefined) return { ok: false, error: "schema", detail: "testcase without file= (run pytest with -o junit_family=xunit1)" };
    const name = tc.attrs.name ?? "";
    const rel = relTo(workRoot, file);
    const mod = rel.split("/").at(-1)?.replace(/\.py$/, "") ?? "";
    const cls = (tc.attrs.classname ?? "").split(".").filter((x) => x !== "");
    const at = cls.indexOf(mod);
    const suite = at >= 0 ? cls.slice(at + 1) : [];
    const kids = tc.children.map((c) => c.name);
    const status: TestStatus = kids.includes("failure") || kids.includes("error") ? "failed" : kids.includes("skipped") ? "skipped" : "passed";
    const c: TestCase = { file: rel, suite, name, status, ...withMs(finiteMs(Number(tc.attrs.time), 1000)) };
    const id = testCaseId(c);
    const prev = byId.get(id);
    if (!prev || RANK[status] > RANK[prev.status]) byId.set(id, prev ? { ...prev, status } : c);
  }
  const tests = [...byId.values()];
  const success = declaredBad === 0 && !tests.some((t) => t.status === "failed");
  return { ok: true, report: { version: 1, tool: "pytest", success, tests } };
}

const GoEvent = z.object({ Action: z.string(), Package: z.string().optional(), ImportPath: z.string().optional(), Test: z.string().optional(), Elapsed: z.number().optional() }).passthrough();
/**
 * `go test -json` (test2json): one event per line. A test's last pass/fail/skip decides; a test that ran and never ended
 * (panic, timeout) failed; a package or build failure makes the run fail even without a test of its own. Lines that are
 * not JSON (a panic printed past test2json) are skipped; zero events is a broken report.
 */
export function goTestJsonToTestReport(raw: string, o: { goModule?: string }): AdapterResult {
  const order: string[] = [];
  const cases = new Map<string, { pkg: string; test: string; status: TestStatus | null; ms?: number }>();
  let events = 0;
  let failed = false;
  const fileOf = (pkg: string) => {
    const m = o.goModule;
    if (m === undefined) return pkg;
    return pkg === m ? "." : pkg.startsWith(`${m}/`) ? pkg.slice(m.length + 1) : pkg;
  };
  for (const line of raw.split("\n")) {
    if (!line.startsWith("{")) continue;
    let j: unknown;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const e = GoEvent.safeParse(j);
    if (!e.success) continue;
    events++;
    const { Action: a, Package: pkg, Test: test } = e.data;
    if (a === "build-fail") failed = true;
    if (pkg === undefined) continue;
    if (test === undefined) {
      if (a === "fail") failed = true;
      continue;
    }
    const key = `${pkg}\u0000${test}`;
    let c = cases.get(key);
    if (!c) {
      c = { pkg, test, status: null };
      cases.set(key, c);
      order.push(key);
    }
    if (a === "pass" || a === "fail" || a === "skip") {
      c.status = a === "pass" ? "passed" : a === "fail" ? "failed" : "skipped";
      const ms = finiteMs(e.data.Elapsed, 1000);
      if (ms !== undefined) c.ms = ms;
    }
  }
  if (events === 0) return { ok: false, error: "schema", detail: "no go test -json events" };
  const tests: TestCase[] = order.map((k) => {
    const c = cases.get(k) as { pkg: string; test: string; status: TestStatus | null; ms?: number };
    const parts = c.test.split("/");
    return { file: fileOf(c.pkg), suite: parts.slice(0, -1), name: parts.at(-1) ?? c.test, status: c.status ?? "failed", ...withMs(c.ms) };
  });
  const success = !failed && !tests.some((t) => t.status === "failed");
  return { ok: true, report: { version: 1, tool: "go", success, tests } };
}

const LibtestEvent = z.object({ type: z.enum(["suite", "test", "bench", "report"]), event: z.string().optional(), name: z.string().optional(), exec_time: z.number().optional() }).passthrough();
/**
 * libtest JSON (`cargo test --no-fail-fast -- -Z unstable-options --format json --report-time`, D-680 [НП: unstable on
 * stable Rust, needs RUSTC_BOOTSTRAP=1]) with cargo's stderr merged in: the events never name the test binary, so the
 * file of a test is the target of the last `Running <target> (…)` / `Doc-tests <crate>` line (else `suite-<n>`). A
 * test or suite that started and never ended failed; `ignored` is skipped.
 */
export function libtestToTestReport(raw: string): AdapterResult {
  const tests: TestCase[] = [];
  let suiteN = 0;
  let target: string | null = null;
  let file = "suite-0";
  let open = new Map<string, number>();
  let suiteOpen = false;
  let failed = false;
  let events = 0;
  const closeSuite = () => {
    for (const idx of open.values()) {
      const t = tests[idx];
      if (t) t.status = "failed";
      failed = true;
    }
    if (open.size > 0 || suiteOpen) failed = true;
    open = new Map();
    suiteOpen = false;
  };
  for (const line of raw.split("\n")) {
    const run = /^\s+Running (?:unittests )?(\S+) \(/.exec(line);
    const doc = /^\s+Doc-tests (\S+)\s*$/.exec(line);
    if (run || doc) {
      target = run ? (run[1] as string) : `doc-tests ${doc?.[1] as string}`;
      continue;
    }
    if (!line.trimStart().startsWith("{")) continue;
    let j: unknown;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const e = LibtestEvent.safeParse(j);
    if (!e.success) continue;
    events++;
    const ev = e.data;
    if (ev.type === "suite") {
      if (ev.event === "started") {
        if (suiteOpen) closeSuite();
        suiteN++;
        file = target ?? `suite-${suiteN}`;
        target = null;
        suiteOpen = true;
      } else {
        if (ev.event === "failed") failed = true;
        suiteOpen = false;
        closeSuite();
      }
      continue;
    }
    if (ev.type !== "test" || ev.name === undefined) continue;
    const parts = ev.name.includes(" - ") ? [ev.name] : ev.name.split("::");
    const base = { file, suite: parts.slice(0, -1), name: parts.at(-1) ?? ev.name };
    if (ev.event === "started") {
      open.set(ev.name, tests.push({ ...base, status: "failed" }) - 1);
      continue;
    }
    const status: TestStatus = ev.event === "ok" ? "passed" : ev.event === "ignored" ? "skipped" : "failed";
    const ms = withMs(finiteMs(ev.exec_time, 1000));
    const idx = open.get(ev.name);
    if (idx !== undefined) {
      tests[idx] = { ...base, status, ...ms };
      open.delete(ev.name);
    } else tests.push({ ...base, status, ...ms });
  }
  closeSuite();
  if (events === 0) return { ok: false, error: "schema", detail: "no libtest JSON events" };
  const success = !failed && !tests.some((t) => t.status === "failed");
  return { ok: true, report: { version: 1, tool: "cargo", success, tests } };
}

/** $MANDAT_REPORT of any supported runner → the detectors' view (missing, too large and broken reports as before). */
export function parseReport(format: ReportFormat, raw: string | null, ctx: ReportContext): ParsedReport {
  if (raw === null) return { valid: false, error: "missing", detail: "no report" };
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > MAX_REPORT_BYTES) return { valid: false, error: "too_large", detail: `${bytes} bytes` };
  const r: AdapterResult =
    format === "pytest-junit" ? pytestJunitToTestReport(raw, ctx.workRoot)
    : format === "go-test-json" ? goTestJsonToTestReport(raw, ctx.goModule === undefined ? {} : { goModule: ctx.goModule })
    : format === "libtest-json" ? libtestToTestReport(raw)
    : vitestToTestReport(raw, ctx.workRoot, format === "jest-json" ? "jest" : format === "node-test" ? "node-test" : "vitest");
  if (!r.ok) return { valid: false, error: r.error, detail: r.detail };
  return parsedFromTestReport(r.report);
}
