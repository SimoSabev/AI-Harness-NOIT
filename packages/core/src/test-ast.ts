import ts from "typescript";

// D-233 / S2 / S31: static view of a test file (no execution). Pure: source text in, data out.
const TEST_FNS = new Set(["it", "test"]);
const SUITE_FNS = new Set(["describe", "suite"]);
const MODIFIERS = new Set(["skip", "only", "todo", "concurrent", "sequential", "fails", "skipIf", "runIf"]);
const ASSERT = /^(expect|assert[A-Za-z]*)$/;

export interface StaticTest {
  /** describe chain + title; null when the title is not a static string. */
  path: string[] | null;
  /** expect(...)/assert*(...) calls in the body, plus those of local helpers it calls (one level of helpers). */
  assertions: number;
  /** normalized source lines in the body that contain an assertion call. */
  assertionLines: string[];
  /** largest object/array literal element count passed to toEqual/toStrictEqual/toMatchObject. */
  mergedLiteral: number;
  each: boolean;
}

export interface StaticTestFile {
  tests: StaticTest[];
  /** true when tests are generated (.each, inside loops or callbacks other than describe) → not countable. */
  dynamic: boolean;
}

type Callee = { base: string; each: boolean } | null;

function calleeOf(e: ts.Expression): Callee {
  // it, it.skip, it.only.each, it.each([...]) (the call expression of .each), test.skipIf(x)
  let each = false;
  let cur: ts.Expression = e;
  for (;;) {
    if (ts.isIdentifier(cur)) return { base: cur.text, each };
    if (ts.isPropertyAccessExpression(cur)) {
      if (cur.name.text === "each") each = true;
      else if (!MODIFIERS.has(cur.name.text)) return null;
      cur = cur.expression;
      continue;
    }
    if (ts.isCallExpression(cur)) {
      // test.each([...]) or test.skipIf(cond) — keep walking from the callee
      cur = cur.expression;
      continue;
    }
    return null;
  }
}

function staticString(e: ts.Expression | undefined): string | null {
  if (!e) return null;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  return null;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function countAssertions(body: ts.Node, sf: ts.SourceFile, helpers: Map<string, ts.Node>, depth: number): { n: number; lines: Set<string>; merged: number } {
  let n = 0;
  let merged = 0;
  const lines = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const root = rootIdentifier(node.expression);
      if (root && ASSERT.test(root) && isAssertionStart(node)) {
        n++;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        lines.add(norm(sf.text.split("\n")[line] ?? ""));
      }
      if (ts.isPropertyAccessExpression(node.expression) && ["toEqual", "toStrictEqual", "toMatchObject"].includes(node.expression.name.text)) {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) merged = Math.max(merged, arg.properties.length);
        if (arg && ts.isArrayLiteralExpression(arg)) merged = Math.max(merged, arg.elements.length);
      }
      if (ts.isIdentifier(node.expression) && depth === 0) {
        const h = helpers.get(node.expression.text);
        if (h) {
          const inner = countAssertions(h, sf, helpers, depth + 1);
          n += inner.n;
          for (const l of inner.lines) lines.add(l);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return { n, lines, merged };
}

function rootIdentifier(e: ts.Expression): string | null {
  let cur = e;
  while (ts.isPropertyAccessExpression(cur) || ts.isCallExpression(cur)) cur = cur.expression;
  return ts.isIdentifier(cur) ? cur.text : null;
}

/** Counts `expect(x).toBe(y)` once: only the innermost call whose callee is the bare `expect`/`assert*` identifier. */
function isAssertionStart(node: ts.CallExpression): boolean {
  const e = node.expression;
  if (ts.isIdentifier(e)) return true; // expect(x), assert(x), assertEquals(x)
  // expect.soft(x) / assert.equal(x): property on the root identifier
  return ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && ASSERT.test(e.expression.text);
}

export function parseTestFile(code: string, file: string): StaticTestFile {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const helpers = new Map<string, ts.Node>();
  // Top-level and describe-level function declarations / const arrow functions are helpers.
  const collectHelpers = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) helpers.set(node.name.text, node.body);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      helpers.set(node.name.text, node.initializer.body);
    }
    ts.forEachChild(node, collectHelpers);
  };
  collectHelpers(sf);
  const tests: StaticTest[] = [];
  let dynamic = false;
  const walk = (node: ts.Node, chain: string[] | null, inLoop: boolean) => {
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node)) {
      ts.forEachChild(node, (c) => walk(c, chain, true));
      return;
    }
    if (ts.isCallExpression(node)) {
      const c = calleeOf(node.expression);
      if (c && (TEST_FNS.has(c.base) || SUITE_FNS.has(c.base))) {
        const title = staticString(node.arguments[0]);
        if (c.each || inLoop) dynamic = true;
        const fn = node.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a)) as ts.ArrowFunction | ts.FunctionExpression | undefined;
        const nextChain = chain && title !== null && !c.each ? [...chain, title] : null;
        if (TEST_FNS.has(c.base)) {
          const counted = fn ? countAssertions(fn.body, sf, helpers, 0) : { n: 0, lines: new Set<string>(), merged: 0 };
          tests.push({ path: nextChain, assertions: counted.n, assertionLines: [...counted.lines], mergedLiteral: counted.merged, each: c.each });
          return;
        }
        if (fn) ts.forEachChild(fn.body, (ch) => walk(ch, nextChain, inLoop));
        return;
      }
      // tests registered inside other callbacks (forEach/map) are generated
      const isArrayCallback = ts.isPropertyAccessExpression(node.expression) && ["forEach", "map", "flatMap"].includes(node.expression.name.text);
      ts.forEachChild(node, (ch) => walk(ch, chain, inLoop || isArrayCallback));
      return;
    }
    ts.forEachChild(node, (ch) => walk(ch, chain, inLoop));
  };
  ts.forEachChild(sf, (n) => walk(n, [], false));
  return { tests, dynamic };
}

/** Declared static tests of a file (S31), or null when the file generates tests. */
export function declaredTestCount(code: string, file: string): number | null {
  const p = parseTestFile(code, file);
  return p.dynamic ? null : p.tests.length;
}

export type WeakenedAssertion = { id: string; level: "fail" | "unknown"; base: number; head: number };

/**
 * D2:weakened_assertions [О]: a test (same static name in base and head) whose head body has fewer assertions, or lost an
 * assertion line without gaining one. Merging several expects into one toEqual({...}) with as many fields → unknown.
 */
export function weakenedAssertions(files: { path: string; base: string; head: string }[]): WeakenedAssertion[] {
  const out: WeakenedAssertion[] = [];
  for (const f of files) {
    const b = parseTestFile(f.base, f.path);
    const h = parseTestFile(f.head, f.path);
    const key = (t: StaticTest) => (t.path ? t.path.join(" > ") : null);
    const headBy = new Map(h.tests.filter((t) => key(t) !== null && !t.each).map((t) => [key(t) as string, t]));
    for (const bt of b.tests) {
      const k = key(bt);
      if (k === null || bt.each) continue;
      const ht = headBy.get(k);
      if (!ht) continue; // renamed or deleted → D2:missing_test, not this class
      const removed = bt.assertionLines.filter((l) => !ht.assertionLines.includes(l));
      const added = ht.assertionLines.filter((l) => !bt.assertionLines.includes(l));
      const fewer = ht.assertions < bt.assertions;
      const lost = removed.length > 0 && added.length === 0;
      if (!fewer && !lost) continue;
      const mergedInto = fewer && ht.mergedLiteral >= bt.assertions - ht.assertions + 1;
      out.push({ id: `${f.path} > ${k}`, level: mergedInto ? "unknown" : "fail", base: bt.assertions, head: ht.assertions });
    }
  }
  return out;
}
