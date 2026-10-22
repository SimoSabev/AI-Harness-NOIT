// E8и (D-358): a `node --test` reporter that writes the Vitest JSON shape the harness parses (testResults[].assertionResults[]
// with ancestorTitles, title, status), so D1, D2 and MUST_PASS read node's runner like vitest and jest. No dependencies; it runs
// in the test sandbox from /opt/mandat/reporters (read-only). Use: node --test --test-reporter=<this> --test-reporter-destination=<file>.
// The ancestors come from the `test:start` order: within one file node starts a suite before its children.
// node loads a custom reporter through its default export (https://nodejs.org/api/test.html#custom-reporters, 22.10.2026)
// eslint-disable-next-line no-restricted-syntax -- the one default export the runner requires
export default async function* nodeTestReporter(source) {
  const files = new Map(); // file → { stack: string[], results: [] }
  const fileOf = (f) => {
    let x = files.get(f);
    if (!x) {
      x = { stack: [], results: [] };
      files.set(f, x);
    }
    return x;
  };
  for await (const ev of source) {
    const d = ev.data ?? {};
    if (typeof d.file !== "string" || typeof d.name !== "string" || typeof d.nesting !== "number") continue;
    const f = fileOf(d.file);
    if (ev.type === "test:start") {
      f.stack.length = d.nesting;
      f.stack[d.nesting] = d.name;
      continue;
    }
    if (ev.type !== "test:pass" && ev.type !== "test:fail") continue;
    if (d.details?.type === "suite") continue;
    const status = d.todo !== undefined && d.todo !== false ? "todo" : d.skip !== undefined && d.skip !== false ? "skipped" : ev.type === "test:pass" ? "passed" : "failed";
    f.results.push({ ancestorTitles: f.stack.slice(0, d.nesting), title: d.name, status });
  }
  const testResults = [...files.entries()].map(([name, f]) => ({ name, status: f.results.some((r) => r.status === "failed") ? "failed" : "passed", assertionResults: f.results }));
  const all = testResults.flatMap((t) => t.assertionResults);
  yield `${JSON.stringify({ numTotalTests: all.length, success: !all.some((r) => r.status === "failed"), testResults })}\n`;
}
