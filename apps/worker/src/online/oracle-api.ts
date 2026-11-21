// D-571 (live test 21.11): writers get only the oracle's API.md, never its tests. A name a test calls on new code that
// API.md leaves out cannot be guessed, so every arm fails it. The oracle is not ready until API.md covers every member
// its tests call on a module they import dynamically (new modules are imported with await import, D-566).

const ID = "[A-Za-z_$][\\w$]*";
const IMPORT = String.raw`import\(\s*["'][^"']+["']\s*\)`;

function namesIn(src: string): Set<string> {
  const out = new Set<string>();
  const thunks = [...src.matchAll(new RegExp(`(?:const|let)\\s+(${ID})\\s*=\\s*(?:async\\s*)?\\(\\s*\\)\\s*=>\\s*${IMPORT}`, "g"))].map((m) => m[1] as string);
  const loaded = `(?:${[IMPORT, ...thunks.map((t) => `${t.replace(/\$/g, "\\$")}\\(\\s*\\)`)].join("|")})`;
  // const m = await L();  const m = await import("…");
  const vars = [...src.matchAll(new RegExp(`(?:const|let)\\s+(${ID})\\s*=\\s*await\\s+${loaded}`, "g"))].map((m) => m[1] as string);
  // const { a, b: c } = await import("…");
  for (const m of src.matchAll(new RegExp(`(?:const|let)\\s*\\{([^}]*)\\}\\s*=\\s*await\\s+${loaded}`, "g")))
    for (const part of (m[1] as string).split(",")) {
      const name = part.split(":")[0]?.trim();
      if (name) out.add(name);
    }
  // (await import("…")).name
  for (const m of src.matchAll(new RegExp(`\\(\\s*await\\s+${loaded}\\s*\\)\\s*\\.\\s*(${ID})`, "g"))) out.add(m[1] as string);
  // m.name anywhere: helpers that hand the module on keep its variable's name
  for (const v of new Set(vars)) for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${v.replace(/\$/g, "\\$")}\\s*\\.\\s*(${ID})`, "g"))) out.add(m[1] as string);
  return out;
}

/** the members the hidden tests call on dynamically imported modules that no API.md line names, sorted */
export function apiGaps(tests: readonly { path: string; data: Buffer }[], api: readonly string[]): string[] {
  const listed = new Set(api.join(" ").match(/[A-Za-z_$][\w$]*/g) ?? []);
  const used = new Set<string>();
  for (const t of tests) for (const n of namesIn(t.data.toString("utf8"))) used.add(n);
  return [...used].filter((n) => !listed.has(n)).sort();
}
