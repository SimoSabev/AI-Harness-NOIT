import type { RepoView } from "./scan.js";

// E10 languages (D-684): Python, Go and Rust from their manifests at the repo root, without a TOML/Go parser dependency
// (only section headers, keys and string arrays are read). `dependencies` lists what the sandbox would have to install;
// until a language's install goes through the gate (D-683), a non-empty list is a question for a human.
export interface LanguageFacts {
  id: "python" | "go" | "rust";
  source: string;
  framework: "pytest" | "go" | "cargo";
  dependencies: string[];
  /** go: the module path of go.mod (test ids are package paths relative to it) */
  module?: string;
}

const PY_MARKERS = ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"];
const PY_LOCKS = ["poetry.lock", "uv.lock", "Pipfile", "Pipfile.lock", "pdm.lock", "pylock.toml"];

/** TOML sections by header (`[a.b]`); `[[x]]` array tables are skipped. Values stay raw text. */
function tomlSections(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let cur = "";
  out.set(cur, []);
  for (const line of text.split(/\r?\n/)) {
    const h = /^\s*\[([^[\]]+)\]\s*(#.*)?$/.exec(line);
    if (h) {
      cur = (h[1] as string).trim();
      if (!out.has(cur)) out.set(cur, []);
      continue;
    }
    if (/^\s*\[\[/.test(line)) {
      cur = "\u0000array";
      out.set(cur, []);
      continue;
    }
    out.get(cur)?.push(line);
  }
  return out;
}

/** The string items of `key = [ "…", '…' ]` (multi-line, comments, brackets inside strings). */
function tomlStringArray(lines: string[] | undefined, key: string): string[] | null {
  if (!lines) return null;
  const body = lines.join("\n");
  const m = new RegExp(`^\\s*${key}\\s*=\\s*\\[`, "m").exec(body);
  if (!m) return null;
  const out: string[] = [];
  let i = m.index + m[0].length;
  while (i < body.length) {
    const c = body[i] as string;
    if (c === "]") return out;
    if (c === "#") {
      const nl = body.indexOf("\n", i);
      i = nl === -1 ? body.length : nl;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = body.indexOf(c, i + 1);
      if (end === -1) return out;
      out.push(body.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    i++;
  }
  return out;
}

const keysOf = (lines: string[] | undefined): string[] =>
  (lines ?? []).flatMap((l) => {
    const k = /^\s*([A-Za-z0-9_.-]+|"[^"]+")\s*=/.exec(l)?.[1];
    return k ? [k.replace(/^"|"$/g, "")] : [];
  });

function python(v: RepoView, has: (p: string) => boolean): LanguageFacts {
  const deps: string[] = [];
  const source = PY_MARKERS.find(has) ?? "pyproject.toml";
  const py = v.read("pyproject.toml");
  if (py !== null) {
    const s = tomlSections(py);
    deps.push(...(tomlStringArray(s.get("project"), "dependencies") ?? []));
    deps.push(...keysOf(s.get("tool.poetry.dependencies")).filter((k) => k !== "python"));
  }
  for (const f of ["requirements.txt", "requirements-dev.txt", "requirements-test.txt"]) {
    const t = v.read(f);
    if (t !== null) deps.push(...t.split(/\r?\n/).map((l) => l.replace(/\s+#.*$/, "").trim()).filter((l) => l !== "" && !l.startsWith("#")));
  }
  deps.push(...PY_LOCKS.filter(has));
  return { id: "python", source, framework: "pytest", dependencies: deps };
}

function go(v: RepoView): LanguageFacts {
  const text = v.read("go.mod") ?? "";
  const module = /^module\s+(\S+)/m.exec(text)?.[1];
  const deps: string[] = [];
  let block = false;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.replace(/\/\/.*$/, "").trim();
    if (block) {
      if (l === ")") block = false;
      else if (l) deps.push(l.split(/\s+/)[0] as string);
      continue;
    }
    if (/^require\s*\($/.test(l)) block = true;
    else if (/^require\s+\S+/.test(l)) deps.push(l.split(/\s+/)[1] as string);
  }
  return { id: "go", source: "go.mod", framework: "go", dependencies: deps, ...(module ? { module } : {}) };
}

function rust(v: RepoView): LanguageFacts {
  const s = tomlSections(v.read("Cargo.toml") ?? "");
  const deps: string[] = [];
  for (const [name, lines] of s) {
    if (/^((target\..+\.)?(dev-|build-)?dependencies)$/.test(name)) deps.push(...keysOf(lines));
    const table = /^(?:target\..+\.)?(?:dev-|build-)?dependencies\.(.+)$/.exec(name)?.[1];
    if (table) deps.push(table);
  }
  return { id: "rust", source: "Cargo.toml", framework: "cargo", dependencies: deps };
}

/** null for a JS/TS project: package.json with a lockfile wins over any other manifest (a helper pyproject.toml stays a helper). */
export function detectLanguage(v: RepoView, files: string[], jsLock: boolean): LanguageFacts | null {
  if (jsLock) return null;
  const has = (p: string) => files.includes(p);
  if (PY_MARKERS.some(has) || PY_LOCKS.some(has)) return python(v, has);
  if (has("go.mod")) return go(v);
  if (has("Cargo.toml")) return rust(v);
  return null;
}
