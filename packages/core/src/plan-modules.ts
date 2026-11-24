import { oracleTag } from "@mandat/contract";
import type { PlanProblem, PlanUnit } from "@mandat/contract";

// D-594 / D-595 (live test 24.11.2026, runs 5 and 6 of M4 on the bakery): the hidden tests say which new modules each
// criterion needs (D-566: a module that does not exist yet is imported inside the test with await import). Two units that
// run side by side must not both need one new module — neither could pass its tests alone and both would write the file.
// A unit's writer gets only the API names its scope's tests call, so it builds its unit and not the whole job.

type HiddenFile = { path: string; data: Buffer | string };

const TEST_START = /\b(?:it|test)(?:\.\w+)?\s*\(\s*(["'`])((?:AC|U)-[1-9]\d{0,3}):/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g;

/** the tagged test blocks of a hidden file: each runs from its it(/test( to the next one */
function blocks(f: HiddenFile): { tag: string; body: string }[] {
  const text = typeof f.data === "string" ? f.data : f.data.toString("utf8");
  const starts = [...text.matchAll(TEST_START)].map((m) => ({ at: m.index ?? 0, tag: oracleTag(`${m[2] ?? ""}:`) }));
  return starts.flatMap((s, k) => (s.tag ? [{ tag: s.tag, body: text.slice(s.at, starts[k + 1]?.at ?? text.length) }] : []));
}

/** a relative import of a test file as a path from the repo root, without the extension; null for a package */
function fromRoot(testPath: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const parts = testPath.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/").replace(/\.(?:m|c)?[jt]sx?$/, "");
}

/** per criterion (AC-n), the new modules its hidden tests import, sorted */
export function criterionModules(files: readonly HiddenFile[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const f of files) {
    for (const b of blocks(f)) {
      if (!b.tag.startsWith("AC-")) continue;
      const set = out.get(b.tag) ?? new Set<string>();
      for (const m of b.body.matchAll(DYNAMIC_IMPORT)) {
        const p = fromRoot(f.path, m[2] ?? "");
        if (p) set.add(p);
      }
      out.set(b.tag, set);
    }
  }
  return new Map([...out].map(([k, v]) => [k, [...v].sort()]));
}

/** every unit a unit waits for, directly or through others */
function ancestors(units: readonly PlanUnit[]): Map<string, Set<string>> {
  const deps = new Map(units.map((u) => [u.id, u.depends_on]));
  const memo = new Map<string, Set<string>>();
  const of = (id: string, seen: Set<string>): Set<string> => {
    const known = memo.get(id);
    if (known) return known;
    const all = new Set<string>();
    for (const d of deps.get(id) ?? []) {
      if (seen.has(d)) continue;
      all.add(d);
      for (const x of of(d, new Set([...seen, d]))) all.add(x);
    }
    memo.set(id, all);
    return all;
  };
  return new Map(units.map((u) => [u.id, of(u.id, new Set([u.id]))]));
}

/**
 * D-594: two units where neither waits for the other may not need the same new module, unless a unit both wait for
 * needs it too (it builds it first). `exists` says a module is already on the base (then it is not new). One problem per
 * pair and module: `u1+u3:src/giftcards/store`.
 */
export function sharedModuleProblems(units: readonly PlanUnit[], modules: ReadonlyMap<string, readonly string[]>, exists: (module: string) => boolean = () => false): PlanProblem[] {
  const anc = ancestors(units);
  const need = units.map((u) => ({ id: u.id, mods: new Set(u.criteria.flatMap((c) => modules.get(c) ?? []).filter((m) => !exists(m))) }));
  const out: PlanProblem[] = [];
  for (let i = 0; i < need.length; i++) {
    for (let k = i + 1; k < need.length; k++) {
      const a = need[i];
      const b = need[k];
      if (!a || !b || anc.get(a.id)?.has(b.id) || anc.get(b.id)?.has(a.id)) continue;
      // a module a unit both wait for already builds is not shared: it exists before either starts
      const before = [...(anc.get(a.id) ?? [])].filter((x) => anc.get(b.id)?.has(x));
      const built = new Set(before.flatMap((x) => [...(need.find((n) => n.id === x)?.mods ?? [])]));
      for (const m of [...a.mods].filter((x) => b.mods.has(x) && !built.has(x)).sort()) out.push({ kind: "shared_new_module", id: `${a.id}+${b.id}:${m}`.slice(0, 200) });
    }
  }
  return out.slice(0, 50);
}

/** the name an API.md line gives: the identifier at the start of its second `…` (the last part of a dotted one) */
function apiName(line: string): string | null {
  const ticks = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
  const m = /^([A-Za-z_$][\w$.]*)/.exec(ticks[1] ?? "");
  return m?.[1]?.split(".").pop() ?? null;
}

/**
 * D-595: the API lines a unit's writer gets — the names its scope's tests (its criteria, the landed units' and the
 * unchanged ones) call. A name no test calls stays (it cannot be placed); no files or no scope keeps the whole API.
 */
export function scopedApi(api: readonly string[], files: readonly HiddenFile[], scope: readonly string[]): string[] {
  if (files.length === 0 || scope.length === 0) return [...api];
  const ok = new Set(scope);
  const all = files.flatMap(blocks);
  const mine = all.filter((b) => ok.has(b.tag) || b.tag.startsWith("U-")).map((b) => b.body).join("\n");
  const any = all.map((b) => b.body).join("\n");
  const called = (text: string, name: string) => new RegExp(`(?<![\\w$])${name.replace(/[$]/g, "\\$")}(?![\\w$])`).test(text);
  return api.filter((line) => {
    const name = apiName(line);
    if (!name) return true;
    return called(mine, name) || !called(any, name);
  });
}
