import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";
import { createRedactor } from "@mandat/redaction";

// D-533 (М1 Х1): the conversation reads the selected project, read only, from Mandat's mirror on this computer
// (file://, the same mirror as repo-facts). Everything comes out of git objects at refs/heads/main, so there is no
// working tree to escape and a symlink is never followed (it is a blob that holds its target, and it is refused).
// Paths are normalized and confined; .env*, key and credential files and anything the redactor flags are refused.
// The reader returns text for the model only; the caller never logs or stores it. No write, exec or network tool.

export type ToolOut = { ok: true; text: string; note: string } | { ok: false; note: string };
export interface RepoReader {
  listDir(dir: string): Promise<ToolOut>;
  readFile(file: string, fromLine?: number, toLine?: number): Promise<ToolOut>;
  grep(pattern: string, dir?: string, ignoreCase?: boolean): Promise<ToolOut>;
}

export const READ_MAX_BYTES = 128 * 1024;
export const READ_MAX_LINES = 400;
export const READ_MAX_CHARS = 24_000;
export const LIST_MAX = 300;
export const GREP_MAX = 60;
const GREP_LINE_MAX = 240;
const REF = "refs/heads/main";

const NOT_HERE = "the project is not on this computer";
/** a reader for a project that is not on this computer: every tool says so */
export const unavailableReader: RepoReader = {
  listDir: () => Promise.resolve({ ok: false, note: NOT_HERE }),
  readFile: () => Promise.resolve({ ok: false, note: NOT_HERE }),
  grep: () => Promise.resolve({ ok: false, note: NOT_HERE }),
};

/** a relative path inside the project ("" = its root), or null when it is absolute, escapes or is malformed */
export function confinePath(raw: string): string | null {
  if (raw.length > 300 || /[\0\r\n]/.test(raw)) return null;
  const p = raw.replace(/\\/g, "/").trim();
  if (p.startsWith("/") || /^[a-zA-Z]:/.test(p) || p.startsWith(":")) return null;
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    parts.push(seg);
  }
  return parts.join("/");
}

const SECRET_NAMES = [
  /^\.env/i, // .env, .env.local, .env.example, .envrc
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk|asc|gpg|tfstate)$/i,
  /^\.(npmrc|pypirc|netrc|git-credentials|htpasswd|pgpass)$/i,
  /^(credentials|secrets?)(\.[a-z0-9]+)?$/i,
  /^service[-_]?account.*\.json$/i,
  /^(auth|token)s?\.json$/i,
];
const SECRET_DIRS = new Set([".ssh", ".aws", ".gnupg", ".docker", ".kube", ".azure", ".gcloud", ".git"]);

/** a key, credential or .env file (or anything under a credentials folder): never read, listed or searched */
export function secretPath(p: string): boolean {
  const segs = p.split("/");
  const base = segs.at(-1) ?? "";
  return segs.slice(0, -1).some((s) => SECRET_DIRS.has(s.toLowerCase())) || SECRET_DIRS.has(base.toLowerCase()) || SECRET_NAMES.some((re) => re.test(base));
}

const redactor = createRedactor({ exactSecrets: [] });
/** the redactor (packages/redaction) finds something that looks like a secret */
export const looksSecret = (text: string): boolean => Object.keys(redactor.redactText(text).hits).length > 0;

interface Entry { mode: string; type: string; sha: string; size: number; path: string }
function entries(out: Buffer): Entry[] {
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .flatMap((rec) => {
      const m = /^(\d{6}) (\w+) ([0-9a-f]{40,64}) +(-|\d+)\t(.*)$/s.exec(rec);
      return m ? [{ mode: m[1] ?? "", type: m[2] ?? "", sha: m[3] ?? "", size: m[4] === "-" ? 0 : Number(m[4]), path: m[5] ?? "" }] : [];
    });
}

/** the reader over a file:// mirror; null for any other remote (the project is not on this computer) */
export function mirrorReader(remoteUrl: string): RepoReader | null {
  if (!remoteUrl.startsWith("file://")) return null;
  const mirror = remoteUrl.slice("file://".length);
  const git = async (args: string[]): Promise<{ code: number; stdout: Buffer } | null> => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-read-"));
    try {
      return await cleanGit({ tmpHome: tmp }).run(["--literal-pathspecs", ...args], { cwd: mirror });
    } catch {
      return null;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };
  let here: Promise<boolean> | null = null;
  const available = () => (here ??= git(["rev-parse", "--verify", "--quiet", REF]).then((r) => r !== null && r.code === 0));
  const guard = async (raw: string): Promise<{ p: string } | { ok: false; note: string }> => {
    if (!(await available())) return { ok: false, note: NOT_HERE };
    const p = confinePath(raw);
    if (p === null) return { ok: false, note: "refused: the path is outside the project" };
    if (p !== "" && secretPath(p)) return { ok: false, note: "refused: a secret or credential file" };
    return { p };
  };

  return {
    async listDir(dir) {
      const g = await guard(dir);
      if (!("p" in g)) return g;
      const r = await git(["ls-tree", "-z", "-l", REF, ...(g.p === "" ? [] : ["--", `${g.p}/`])]);
      if (!r || r.code !== 0) return { ok: false, note: "no such directory" };
      const all = entries(r.stdout);
      if (all.length === 0) return { ok: false, note: "no such directory" };
      const shown = all.filter((e) => !secretPath(e.path)).slice(0, LIST_MAX);
      const name = (e: Entry) => (g.p === "" ? e.path : e.path.slice(g.p.length + 1));
      const text = shown.map((e) => (e.type === "tree" ? `${name(e)}/` : e.mode === "120000" ? `${name(e)} (link)` : `${name(e)} (${e.size} B)`)).join("\n");
      return { ok: true, text, note: `${shown.length} entries` };
    },

    async readFile(file, fromLine, toLine) {
      const g = await guard(file);
      if (!("p" in g)) return g;
      if (g.p === "") return { ok: false, note: "a directory, not a file" };
      const r = await git(["ls-tree", "-z", "-l", REF, "--", g.p]);
      const e = r && r.code === 0 ? entries(r.stdout).find((x) => x.path === g.p) : undefined;
      if (!e) return { ok: false, note: "no such file" };
      if (e.type === "tree") return { ok: false, note: "a directory, not a file" };
      if (e.type !== "blob" || e.mode === "120000") return { ok: false, note: "refused: a link or a submodule" };
      if (e.size > READ_MAX_BYTES) return { ok: false, note: `refused: larger than ${READ_MAX_BYTES} bytes; use grep` };
      const b = await git(["cat-file", "blob", e.sha]);
      if (!b || b.code !== 0) return { ok: false, note: "could not read the file" };
      if (b.stdout.includes(0)) return { ok: false, note: "refused: a binary file" };
      const content = b.stdout.toString("utf8");
      if (looksSecret(content)) return { ok: false, note: "refused: the file looks like it holds a secret" };
      const lines = content.split("\n");
      if (lines.at(-1) === "") lines.pop();
      const from = Math.max(1, fromLine ?? 1);
      const to = Math.min(lines.length, toLine ?? from + READ_MAX_LINES - 1, from + READ_MAX_LINES - 1);
      if (from > lines.length) return { ok: true, text: "", note: `${lines.length} lines; nothing from line ${from}` };
      const text = lines.slice(from - 1, to).map((l, i) => `${from + i}| ${l}`).join("\n").slice(0, READ_MAX_CHARS);
      return { ok: true, text, note: `lines ${from}-${to} of ${lines.length}` };
    },

    async grep(pattern, dir, ignoreCase) {
      const g = await guard(dir ?? "");
      if (!("p" in g)) return g;
      if (pattern.length < 2 || pattern.length > 200 || /[\0\r\n]/.test(pattern)) return { ok: false, note: "refused: a bad pattern" };
      // fixed strings (no regex to blow up), text files only, a bounded count per file
      const r = await git(["grep", "-n", "-I", "-F", "-z", "--no-color", ...(ignoreCase ? ["-i"] : []), "--max-count", "20", "-e", pattern, REF, ...(g.p === "" ? [] : ["--", g.p])]);
      if (!r || (r.code !== 0 && r.code !== 1)) return { ok: false, note: "the search failed" };
      let withheld = 0;
      const hits: string[] = [];
      for (const rec of r.stdout.toString("utf8").split("\n")) {
        if (hits.length >= GREP_MAX) break;
        const [where, n, ...rest] = rec.split("\0");
        if (!where || !n) continue;
        const file = where.startsWith(`${REF}:`) ? where.slice(REF.length + 1) : where;
        const line = rest.join("\0");
        if (secretPath(file) || looksSecret(line)) {
          withheld++;
          continue;
        }
        hits.push(`${file}:${n}: ${line.slice(0, GREP_LINE_MAX)}`);
      }
      return { ok: true, text: hits.join("\n"), note: `${hits.length} matches${withheld > 0 ? `, ${withheld} withheld` : ""}` };
    },
  };
}
