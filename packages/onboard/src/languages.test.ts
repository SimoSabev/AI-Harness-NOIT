import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { languageOf, repoConfigFromPolicy } from "@mandat/contract";
import { FIXTURES, memView } from "./fixtures.test-helper.js";
import { propose } from "./propose.js";
import { proposeProfile } from "./propose-profile.js";
import { scanRepo } from "./scan.js";

// E10 languages (D-684): the scanner recognises pyproject.toml / go.mod / Cargo.toml; the proposal is a policy the
// sandbox can run (language image, nothing installed) or says what a human has to do.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function fixture(name: string): Record<string, string> {
  const root = path.join(repo, "fixtures", name);
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const n of readdirSync(path.join(root, rel))) {
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(path.join(root, r)).isDirectory()) walk(r);
      else if (n !== ".mandat.yml") out[r] = readFileSync(path.join(root, r), "utf8");
    }
  };
  walk("");
  return out;
}

describe("скенер: езици (D-684)", () => {
  it("shop-py: python от pyproject.toml, pytest, без зависимости", () => {
    const s = scanRepo(memView(fixture("shop-py")));
    expect(s.language).toEqual({ id: "python", source: "pyproject.toml", framework: "pytest", dependencies: [] });
    expect(s.packageManager).toBe(null);
  });
  it("shop-go: go от go.mod, модулът, без require", () => {
    const s = scanRepo(memView(fixture("shop-go")));
    expect(s.language).toEqual({ id: "go", source: "go.mod", framework: "go", dependencies: [], module: "example.com/shop" });
  });
  it("Cargo.toml: rust; [dependencies] и [dev-dependencies] са зависимости", () => {
    const toml = '[package]\nname = "shop"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n\n[dev-dependencies]\nproptest = { version = "1" }\n';
    const s = scanRepo(memView({ "Cargo.toml": toml, "src/lib.rs": "" }));
    expect(s.language).toEqual({ id: "rust", source: "Cargo.toml", framework: "cargo", dependencies: ["serde", "proptest"] });
    expect(scanRepo(memView({ "Cargo.toml": '[package]\nname = "x"\n\n[dependencies]\n', "src/lib.rs": "" })).language?.dependencies).toEqual([]);
  });
  it("Python зависимости: [project].dependencies, requirements*.txt, заключващи файлове", () => {
    const deps = (files: Record<string, string>) => scanRepo(memView({ "tests/test_a.py": "", ...files })).language?.dependencies;
    expect(deps({ "pyproject.toml": '[project]\nname = "x"\ndependencies = [\n  "requests>=2",\n  "attrs",\n]\n' })).toEqual(["requests>=2", "attrs"]);
    expect(deps({ "pyproject.toml": '[project]\nname = "x"\ndependencies = ["a"]\n[project.optional-dependencies]\ntest = ["b"]\n' })).toEqual(["a"]);
    expect(deps({ "requirements.txt": "# c\nflask==3\n\n-r other.txt\n" })).toEqual(["flask==3", "-r other.txt"]);
    expect(deps({ "pyproject.toml": "[project]\nname='x'\n", "uv.lock": "x" })).toEqual(["uv.lock"]);
    expect(scanRepo(memView({ "setup.py": "", "tests/test_a.py": "" })).language?.id).toBe("python");
  });
  it("go.mod с require → зависимост (блок и ред)", () => {
    const s = scanRepo(memView({ "go.mod": "module m\n\ngo 1.27\n\nrequire (\n\tgithub.com/a/b v1.0.0\n\tgolang.org/x/text v0.1.0 // indirect\n)\nrequire c.io/d v2.0.0\n", "a.go": "" }));
    expect(s.language?.dependencies).toEqual(["github.com/a/b", "golang.org/x/text", "c.io/d"]);
  });
  it("JS хранилище: без език (null) — нищо не се мени за JS/TS", () => {
    expect(scanRepo(memView(FIXTURES["npm-vitest"] as Record<string, string>)).language).toBe(null);
    // a JS app with a helper pyproject.toml stays a JS project (package.json + lockfile win)
    expect(scanRepo(memView({ ...(FIXTURES["npm-vitest"] as Record<string, string>), "pyproject.toml": "[project]\nname='x'\n" })).language).toBe(null);
  });
});

describe("предложение за език (D-684)", () => {
  it("shop-py → валидна политика с python; repoConfig със pytest-junit; без needs_human за runner", () => {
    const p = propose(scanRepo(memView(fixture("shop-py"))));
    expect(p.policy.runtime).toEqual({ language: "python", install: "none" });
    expect(p.policy.tests.framework).toBe("pytest");
    expect(p.policy.protected_paths).toEqual(expect.arrayContaining(["pyproject.toml", "**/conftest.py", ".mandat.yml"]));
    expect(p.policy.protected_json_fields).toEqual({});
    expect(p.policy.task_types.bugfix?.allowed_paths).toEqual(["src/**"]);
    const rc = repoConfigFromPolicy(p.policy);
    expect(rc.ok && [languageOf(rc.config), rc.config.tests.format]).toEqual(["python", "pytest-junit"]);
    expect(p.needs_human.filter((n) => n.startsWith("runner") || n.startsWith("runtime"))).toEqual([]);
  });
  it("shop-go → go; bugfix пипа само .go файлове; go.mod/go.sum защитени", () => {
    const p = propose(scanRepo(memView(fixture("shop-go"))));
    expect(p.policy.runtime).toEqual({ language: "go", install: "none" });
    expect(p.policy.task_types.bugfix?.allowed_paths).toEqual(["**/*.go"]);
    expect(p.policy.protected_paths).toEqual(expect.arrayContaining(["go.mod", "go.sum"]));
    const rc = repoConfigFromPolicy(p.policy);
    expect(rc.ok && rc.config.tests.format).toBe("go-test-json");
  });
  it("със зависимости → needs_human (пясъчникът още не ги инсталира)", () => {
    const p = propose(scanRepo(memView({ "pyproject.toml": '[project]\nname="x"\ndependencies=["requests"]\n', "tests/test_a.py": "" })));
    expect(p.needs_human.join(" ")).toContain("runtime.dependencies");
  });
  it("профилът: командите на агента са на езика (не npm)", () => {
    const pr = proposeProfile(scanRepo(memView(fixture("shop-py"))), { repoId: "local", version: 1 });
    expect(pr.profile.layers.b.commands).toEqual({ test: "python3 -m pytest", test_one: "python3 -m pytest {file}" });
    const go = proposeProfile(scanRepo(memView(fixture("shop-go"))), { repoId: "local", version: 1 });
    expect(go.profile.layers.b.commands).toEqual({ test: "go test ./...", test_one: "go test -run {name} ./..." });
  });
});
