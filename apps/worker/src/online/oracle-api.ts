import path from "node:path";

// D-571 (live test 21.11): writers get only the oracle's API.md, never its tests. A name a test calls on new code that
// API.md leaves out cannot be guessed, so every arm fails it. The oracle is not ready until API.md covers every member
// its tests call on a NEW module they import dynamically (new modules are imported with await import, D-566). A module
// that already exists on the base is skipped: its names are in the code the writers see (advance in src/orders/order.ts
// was flagged on the live test).

const ID = "[A-Za-z_$][\\w$]*";
const esc = (s: string): string => s.replace(/[$]/g, "\\$");
const SPEC = String.raw`import\(\s*["']([^"']+)["']\s*\)`;

/** each name a test reads from a dynamically imported module, with that module's import specifier */
function usesIn(src: string): { spec: string; name: string }[] {
  const out: { spec: string; name: string }[] = [];
  const thunks = new Map<string, string>();
  for (const m of src.matchAll(new RegExp(`(?:const|let)\\s+(${ID})\\s*=\\s*(?:async\\s*)?\\(\\s*\\)\\s*=>\\s*${SPEC}`, "g"))) thunks.set(m[1] as string, m[2] as string);
  // a load expression: import("…") or a thunk call; the specifier is in group 1 (import) or found through the thunk
  const load = (): RegExp => new RegExp(`(?:${SPEC}|(${[...thunks.keys()].map(esc).join("|") || "(?!)"})\\(\\s*\\))`, "g");
  const specOf = (m: RegExpMatchArray, at: number): string => (m[at] as string | undefined) ?? thunks.get(m[at + 1] as string) ?? "";
  const L = load().source;
  const vars = new Map<string, string>();
  // const m = await L();  const m = await import("…");
  for (const m of src.matchAll(new RegExp(`(?:const|let)\\s+(${ID})\\s*=\\s*await\\s+${L}`, "g"))) vars.set(m[1] as string, specOf(m, 2));
  // const { a, b: c } = await import("…");
  for (const m of src.matchAll(new RegExp(`(?:const|let)\\s*\\{([^}]*)\\}\\s*=\\s*await\\s+${L}`, "g")))
    for (const part of (m[1] as string).split(",")) {
      const name = part.split(":")[0]?.trim();
      if (name) out.push({ spec: specOf(m, 2), name });
    }
  // (await import("…")).name
  for (const m of src.matchAll(new RegExp(`\\(\\s*await\\s+${L}\\s*\\)\\s*\\.\\s*(${ID})`, "g"))) out.push({ spec: specOf(m, 1), name: m[3] as string });
  // m.name anywhere: helpers that hand the module on keep its variable's name
  for (const [v, spec] of vars) for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${esc(v)}\\s*\\.\\s*(${ID})`, "g"))) out.push({ spec, name: m[1] as string });
  return out;
}

/** the repo path candidates of a relative import from a test file (with or without an extension, or a folder index) */
function candidates(testPath: string, spec: string): string[] {
  if (!spec.startsWith(".")) return [];
  const p = path.posix.normalize(path.posix.join(path.posix.dirname(testPath), spec));
  const stem = p.replace(/\.(?:[cm]?js|jsx)$/, "");
  return [p, ...["ts", "tsx", "mts", "cts", "js", "jsx", "mjs"].flatMap((x) => [`${stem}.${x}`, `${stem}/index.${x}`])];
}

/** the members the hidden tests call on new, dynamically imported modules that no API.md line names, sorted */
export function apiGaps(tests: readonly { path: string; data: Buffer }[], api: readonly string[], baseFiles: readonly string[] = []): string[] {
  const listed = new Set(api.join(" ").match(/[A-Za-z_$][\w$]*/g) ?? []);
  const onBase = new Set(baseFiles);
  const used = new Set<string>();
  for (const t of tests)
    for (const u of usesIn(t.data.toString("utf8"))) if (!candidates(t.path, u.spec).some((c) => onBase.has(c))) used.add(u.name);
  return [...used].filter((n) => !listed.has(n)).sort();
}
