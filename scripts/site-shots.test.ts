import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHOT_LANGS, SHOT_THEMES, parseArgs, safeDbName, shotFile, shotPlan, shotsWebEnv } from "./site-shots.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const list = JSON.parse(readFileSync(path.join(repo, "apps/site/shots.json"), "utf8")) as { shots: { name: string; route: string }[] };

// E9g B step 7 (D-378): the real UI screenshots of the docs site, taken by a script against the harness web UI.
describe("site shots (E9g B)", () => {
  it("one file per screen, language and theme, named <screen>-<lang>-<theme>.png", () => {
    expect(SHOT_LANGS).toEqual(["en", "bg"]);
    expect(SHOT_THEMES).toEqual(["dark", "light"]);
    expect(shotFile("inbox", "bg", "light")).toBe("inbox-bg-light.png");
    const plan = shotPlan(list.shots);
    expect(plan).toHaveLength(list.shots.length * 4);
    expect(new Set(plan.map((p) => p.file)).size).toBe(plan.length);
    expect(plan[0]).toEqual({ name: "inbox", route: "/", lang: "en", theme: "dark", file: "inbox-en-dark.png" });
  });

  it("only local routes and kebab-case names", () => {
    expect(() => shotPlan([{ name: "x", route: "https://evil.example/" }])).toThrow(/route/);
    expect(() => shotPlan([{ name: "x", route: "//evil.example/" }])).toThrow(/route/);
    expect(() => shotPlan([{ name: "Bad Name", route: "/" }])).toThrow(/name/);
  });

  it("the disposable database is only ever mandat_shots*: never the local harness database", () => {
    expect(safeDbName("postgresql://postgres:postgres@127.0.0.1:54329/mandat_shots")).toBe("mandat_shots");
    for (const u of ["postgresql://postgres:postgres@127.0.0.1:54329/postgres", "postgresql://p@127.0.0.1:54329/mandat_e2e", "postgresql://p@127.0.0.1:54329/mandat_shots;drop"]) {
      expect(() => safeDbName(u), u).toThrow(/refusing/);
    }
  });

  it("the web server gets the local owner and the database, never an API key or the KEK", () => {
    const env = shotsWebEnv({ PATH: "/bin", HOME: "/h", ANTHROPIC_API_KEY: "sk-x", OPENAI_API_KEY: "sk-y", MANDAT_KEK: "k", MANDAT_DEMO_DEV_AUTH: "1" }, { dbUrl: "postgresql://x/mandat_shots", owner: "d0000000-0000-4000-8000-0000000000a1" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h", MANDAT_DB_URL: "postgresql://x/mandat_shots", MANDAT_LOCAL_OWNER: "d0000000-0000-4000-8000-0000000000a1", NEXT_TELEMETRY_DISABLED: "1" });
  });

  it("arguments: --url uses a running harness (pnpm local), --out the folder; unknown flags fail", () => {
    expect(parseArgs([])).toEqual({ url: undefined, out: undefined });
    expect(parseArgs(["--url", "http://127.0.0.1:3000", "--out", "x"])).toEqual({ url: "http://127.0.0.1:3000", out: "x" });
    expect(() => parseArgs(["--url", "http://example.com"])).toThrow(/loopback/);
    expect(() => parseArgs(["--nope", "1"])).toThrow(/unknown/);
    expect(() => parseArgs(["--out"])).toThrow(/value/);
  });
});
