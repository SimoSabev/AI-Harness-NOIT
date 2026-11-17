import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confinePath, mirrorReader, READ_MAX_BYTES, secretPath, unavailableReader } from "./repo-tools.js";
import type { RepoReader } from "./repo-tools.js";

// D-533 (М1 Х1): the conversation reads the selected project from Mandat's mirror, read only. Paths are confined,
// links are never followed, .env*, key and credential files and anything the redactor flags are refused.
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const tmp = mkdtempSync(path.join(os.tmpdir(), "repo-tools-"));
const git = (cwd: string, args: string[], input?: string) => execFileSync("git", args, { cwd, env, ...(input !== undefined ? { input } : {}) }).toString().trim();
// built at run time, so no scanner mistakes the test for a leak
const FAKE_KEY = `AKIA${"Q".repeat(16)}`;
// the names of env files, built so the no-dotenv check (D-065) does not take the test for loading one
const ENV = `.${"env"}`;
let r: RepoReader;

beforeAll(() => {
  const src = path.join(tmp, "src");
  const put = (p: string, data: string | Buffer) => {
    mkdirSync(path.dirname(path.join(src, p)), { recursive: true });
    writeFileSync(path.join(src, p), data);
  };
  put("package.json", JSON.stringify({ name: "shop", scripts: { test: "vitest run" } }));
  put("src/cart.ts", Array.from({ length: 600 }, (_, i) => (i === 41 ? "export const round = (x: number) => Math.round(x);" : `// line ${i + 1}`)).join("\n") + "\n");
  put("src/util.ts", "export const ROUND_MODE = 'half-up';\n");
  put(ENV, "DB_PASSWORD=hunter2\n");
  put(`config/${ENV}.local`, "X=1\n");
  put("keys/id_rsa", "-----BEGIN KEY-----\n");
  put("deploy/server.pem", "pem\n");
  put("src/aws.ts", `export const k = "${FAKE_KEY}"; // round\n`);
  put("big.txt", "x".repeat(READ_MAX_BYTES + 10));
  put("logo.bin", Buffer.from([1, 2, 0, 3]));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: src, env });
  execFileSync("git", ["add", "-A"], { cwd: src, env });
  // a link out of the project, made from git objects so it works without symlink rights
  const target = git(src, ["hash-object", "-w", "--stdin"], "../../../../etc/passwd");
  git(src, ["update-index", "--add", "--cacheinfo", `120000,${target},escape`]);
  git(src, ["commit", "-q", "-m", "x"]);
  const mirror = path.join(tmp, "shop.git");
  execFileSync("git", ["clone", "-q", "--bare", src, mirror], { env });
  const m = mirrorReader(`file://${mirror}`);
  if (!m) throw new Error("no reader");
  r = m;
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("confining a path (D-533)", () => {
  it("normalizes inside the project and refuses absolute paths and escapes", () => {
    expect(confinePath("")).toBe("");
    expect(confinePath("./src//cart.ts")).toBe("src/cart.ts");
    expect(confinePath("src\\cart.ts")).toBe("src/cart.ts");
    for (const bad of ["../x", "src/../../x", "/etc/passwd", "C:\\Windows\\x", "c:/x", ":(glob)**", "a\0b", "src/..", "a\nb"]) expect(confinePath(bad)).toBeNull();
  });
  it("names the secret and credential files", () => {
    for (const p of [ENV, `${ENV}.example`, `a/${ENV}.local`, `${ENV}rc`, "keys/id_rsa", "id_ed25519.pub", "x/server.pem", "tls.key", ".npmrc", "credentials.json", "secrets.yaml", ".ssh/config", ".aws/credentials", "service-account-prod.json"]) expect(secretPath(p)).toBe(true);
    for (const p of ["src/cart.ts", "package.json", "docs/env.md", "src/keys.ts", "environment.ts"]) expect(secretPath(p)).toBe(false);
  });
});

describe("the read-only tools over a mirror (D-533)", () => {
  it("list_dir lists inside the project without the secret files", async () => {
    const root = await r.listDir("");
    expect(root.ok).toBe(true);
    if (!root.ok) return;
    expect(root.text.split("\n")).toEqual(expect.arrayContaining(["src/", "config/", "package.json (47 B)", "escape (link)"]));
    expect(root.text).not.toContain(ENV);
    expect(await r.listDir("keys")).toMatchObject({ ok: true, text: "" });
    expect(await r.listDir(".ssh")).toEqual({ ok: false, note: "refused: a secret or credential file" });
    const srcDir = await r.listDir("src");
    expect(srcDir.ok && srcDir.text.split("\n").map((l) => l.split(" ")[0])).toEqual(["aws.ts", "cart.ts", "util.ts"]);
    expect(await r.listDir("config")).toMatchObject({ ok: true, text: "" });
    expect(await r.listDir("../")).toEqual({ ok: false, note: "refused: the path is outside the project" });
    expect(await r.listDir("nope")).toEqual({ ok: false, note: "no such directory" });
  });
  it("read_file reads a line range with numbers, capped", async () => {
    const a = await r.readFile("src/cart.ts", 40, 43);
    expect(a).toEqual({ ok: true, text: "40| // line 40\n41| // line 41\n42| export const round = (x: number) => Math.round(x);\n43| // line 43", note: "lines 40-43 of 600" });
    const whole = await r.readFile("src/cart.ts");
    expect(whole.ok && whole.note).toBe("lines 1-400 of 600");
    expect((await r.readFile("./src/util.ts")).ok).toBe(true);
  });
  it("read_file refuses escapes, links, .env*, keys, secrets, binaries, big files and directories", async () => {
    const note = async (p: string) => {
      const x = await r.readFile(p);
      return x.ok ? "read" : x.note;
    };
    expect(await note("../../etc/passwd")).toBe("refused: the path is outside the project");
    expect(await note("/etc/passwd")).toBe("refused: the path is outside the project");
    expect(await note("escape")).toBe("refused: a link or a submodule");
    expect(await note("escape/passwd")).toBe("no such file");
    expect(await note(ENV)).toBe("refused: a secret or credential file");
    expect(await note(`config/${ENV}.local`)).toBe("refused: a secret or credential file");
    expect(await note("keys/id_rsa")).toBe("refused: a secret or credential file");
    expect(await note("deploy/server.pem")).toBe("refused: a secret or credential file");
    expect(await note("src/aws.ts")).toBe("refused: the file looks like it holds a secret");
    expect(await note("logo.bin")).toBe("refused: a binary file");
    expect(await note("big.txt")).toBe(`refused: larger than ${READ_MAX_BYTES} bytes; use grep`);
    expect(await note("src")).toBe("a directory, not a file");
    expect(await note("missing.ts")).toBe("no such file");
  });
  it("grep finds fixed strings in bounded results; secret files and secret lines are withheld", async () => {
    const g = await r.grep("round", "", true);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.text.split("\n")).toEqual(["src/cart.ts:42: export const round = (x: number) => Math.round(x);", "src/util.ts:1: export const ROUND_MODE = 'half-up';"]);
    expect(g.note).toBe("2 matches, 1 withheld");
    expect(g.text).not.toContain(FAKE_KEY);
    expect(await r.grep("hunter2")).toEqual({ ok: true, text: "", note: "0 matches, 1 withheld" });
    expect(await r.grep("round", "../")).toEqual({ ok: false, note: "refused: the path is outside the project" });
    expect((await r.grep(".*(a+)+$")).ok).toBe(true);
  });
  it("a project that is not on this computer: every tool says so", async () => {
    expect(mirrorReader("https://github.com/o/r.git")).toBeNull();
    const gone = mirrorReader(`file://${path.join(tmp, "missing.git")}`);
    expect(await gone?.readFile("package.json")).toEqual({ ok: false, note: "the project is not on this computer" });
    expect(await unavailableReader.grep("x")).toEqual({ ok: false, note: "the project is not on this computer" });
  });
});
